import { query } from '@/lib/db/pool';
import { mapRow, mapRows } from '@/lib/db/mappers';
import type { Attachment } from '@/lib/types/database';

export interface AttachmentWithUploader extends Attachment {
  uploaderName: string | null;
}

export async function createAttachment(params: {
  requestId: string;
  filename: string;
  mimeType: string;
  size: number;
  url: string;
  storageKey: string;
  uploadedBy: string | null;
}): Promise<Attachment> {
  const result = await query(
    `INSERT INTO attachments
       (request_id, filename, mime_type, size, url, storage_key, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      params.requestId,
      params.filename,
      params.mimeType,
      params.size,
      params.url,
      params.storageKey,
      params.uploadedBy,
    ]
  );
  return mapRow<Attachment>(result.rows[0]);
}

export async function listAttachmentsByRequest(
  requestId: string
): Promise<AttachmentWithUploader[]> {
  const result = await query(
    `SELECT a.*, u.name AS uploader_name
     FROM attachments a
     LEFT JOIN users u ON u.id = a.uploaded_by
     WHERE a.request_id = $1
     ORDER BY a.created_at ASC`,
    [requestId]
  );
  return mapRows<AttachmentWithUploader>(result.rows);
}

export interface AttachmentWithOrg extends Attachment {
  /** Owning org, joined from the request — every caller needs it to authorize. */
  organizationId: string;
}

/**
 * Fetch one attachment together with its request's organization, so callers
 * can reject cross-org access without a second query.
 */
export async function getAttachmentById(
  id: string
): Promise<AttachmentWithOrg | null> {
  const result = await query(
    `SELECT a.*, fr.organization_id
     FROM attachments a
     JOIN feature_requests fr ON fr.id = a.request_id
     WHERE a.id = $1`,
    [id]
  );
  return result.rows.length > 0 ? mapRow<AttachmentWithOrg>(result.rows[0]) : null;
}

/** Org-scoped delete: an id from another org matches nothing. */
export async function deleteAttachment(id: string, orgId: string): Promise<boolean> {
  const result = await query(
    `DELETE FROM attachments a
     USING feature_requests fr
     WHERE a.id = $1 AND fr.id = a.request_id AND fr.organization_id = $2`,
    [id, orgId]
  );
  return (result.rowCount ?? 0) > 0;
}
