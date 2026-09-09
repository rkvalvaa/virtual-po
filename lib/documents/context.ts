import { randomUUID } from 'node:crypto';
import { query, transaction } from '@/lib/db/pool';
import { lockAuthorizedRequest } from '@/lib/agents/runs';
import { readAttachment } from '@/lib/storage/blob';
import { DOCUMENT_LIMITS, supportsDocumentContext } from './limits';
import { extractDocumentText } from './text';

export interface DocumentSelection {
  attachmentId: string; status: 'PENDING' | 'PROCESSED' | 'ERROR'; truncated: boolean; error: string | null;
}
export interface DocumentSource {
  attachmentId: string; filename: string; contentHash: string; text: string; lineCount: number; truncated: boolean;
}
export interface DocumentBundle { sources: DocumentSource[]; omitted: { attachmentId: string; reason: string }[]; byteLimit: number }

export async function listDocumentContext(requestId: string, orgId: string, userId: string): Promise<DocumentSelection[]> {
  const result = await query(`SELECT c.attachment_id, c.status, c.truncated, c.error
    FROM attachment_context c JOIN attachments a ON a.id=c.attachment_id
    JOIN feature_requests r ON r.id=a.request_id
    JOIN organization_users m ON m.organization_id=r.organization_id AND m.user_id=$3
    WHERE r.id=$1 AND r.organization_id=$2 ORDER BY a.created_at,a.id`, [requestId, orgId, userId]);
  return result.rows.map(row => ({ attachmentId: row.attachment_id, status: row.status, truncated: row.truncated, error: row.error }));
}

export async function selectDocumentContext(attachmentId: string, orgId: string, userId: string, selected: boolean): Promise<void> {
  const token = randomUUID();
  const attachment = await transaction(async () => {
    const found = await query(`SELECT a.* FROM attachments a JOIN feature_requests r ON r.id=a.request_id
      JOIN organization_users m ON m.organization_id=r.organization_id AND m.user_id=$3
      WHERE a.id=$1 AND r.organization_id=$2`, [attachmentId, orgId, userId]);
    const row = found.rows[0];
    if (!row) throw new Error('Attachment not found or membership revoked.');
    const request = await lockAuthorizedRequest({ requestId: row.request_id, orgId, userId, agent: 'assessment' });
    if (selected && request.archivedAt) throw new Error('Restore this archived request before selecting supporting documents.');
    const running = await query("SELECT id FROM agent_runs WHERE request_id=$1 AND status='RUNNING' AND expires_at>clock_timestamp()", [row.request_id]);
    if (running.rowCount) throw new Error('Wait for the active AI run before changing supporting documents.');
    if (!selected) { await query('DELETE FROM attachment_context WHERE attachment_id=$1', [attachmentId]); return null; }
    if (!supportsDocumentContext(row.mime_type)) throw new Error('Plain text and Markdown are the supported AI document formats.');
    if (row.size > DOCUMENT_LIMITS.fileBytes) throw new Error('AI document context supports files up to 256 KiB.');
    if (!row.storage_key?.startsWith(`orgs/${orgId}/requests/${row.request_id}/`)) throw new Error('Attachment storage location is invalid.');
    const count = await query(`SELECT COUNT(*)::int AS count FROM attachment_context c JOIN attachments a ON a.id=c.attachment_id
      WHERE a.request_id=$1 AND a.id<>$2`, [row.request_id, attachmentId]);
    if (count.rows[0].count >= DOCUMENT_LIMITS.files) throw new Error('Select at most five supporting documents.');
    await query(`INSERT INTO attachment_context(attachment_id,status,processing_token,selected_by)
      VALUES($1,'PENDING',$2,$3) ON CONFLICT(attachment_id) DO UPDATE SET status='PENDING',processing_token=$2,
      selected_by=$3,extracted_text=NULL,content_hash=NULL,line_count=NULL,source_bytes=NULL,truncated=FALSE,error=NULL,updated_at=NOW()`, [attachmentId, token, userId]);
    return row;
  });
  if (!attachment) return;
  try {
    const stored = await readAttachment(attachment.storage_key);
    if (!stored) throw new Error('Stored document is unavailable.');
    const extracted = await extractDocumentText(stored.stream);
    await query(`UPDATE attachment_context SET status='PROCESSED',extracted_text=$3,content_hash=$4,
      line_count=$5,source_bytes=$6,truncated=$7,updated_at=NOW()
      WHERE attachment_id=$1 AND processing_token=$2`, [attachmentId, token, extracted.text, extracted.contentHash,
      extracted.lineCount, extracted.sourceBytes, extracted.truncated]);
  } catch (error) {
    const message = error instanceof Error && /UTF-8|binary|256|timed out|unavailable/.test(error.message)
      ? error.message : 'Unable to process this document. Retry or upload it again.';
    await query("UPDATE attachment_context SET status='ERROR',error=$3,updated_at=NOW() WHERE attachment_id=$1 AND processing_token=$2", [attachmentId, token, message]);
  }
}

export async function supportingDocuments(requestId: string, orgId: string, userId: string): Promise<DocumentBundle> {
  const result = await query(`SELECT c.*,a.filename FROM attachment_context c JOIN attachments a ON a.id=c.attachment_id
    JOIN feature_requests r ON r.id=a.request_id
    JOIN organization_users m ON m.organization_id=r.organization_id AND m.user_id=$3
    WHERE r.id=$1 AND r.organization_id=$2 ORDER BY a.created_at,a.id`, [requestId, orgId, userId]);
  const sources: DocumentSource[] = [], omitted: DocumentBundle['omitted'] = [];
  let used = 0;
  for (const row of result.rows) {
    if (row.status !== 'PROCESSED') {
      omitted.push({ attachmentId: row.attachment_id, reason: row.status === 'ERROR' ? 'Processing failed' : 'Processing pending' });
      continue;
    }
    const source: DocumentSource = { attachmentId: row.attachment_id, filename: row.filename, text: row.extracted_text,
      contentHash: row.content_hash, lineCount: row.line_count, truncated: row.truncated };
    const bytes = Buffer.byteLength(JSON.stringify(source));
    if (used + bytes > DOCUMENT_LIMITS.contextBytes || sources.length >= DOCUMENT_LIMITS.files) {
      omitted.push({ attachmentId: row.attachment_id, reason: 'Combined context limit reached' });
      continue;
    }
    sources.push(source); used += bytes;
  }
  return { sources, omitted, byteLimit: DOCUMENT_LIMITS.contextBytes };
}
