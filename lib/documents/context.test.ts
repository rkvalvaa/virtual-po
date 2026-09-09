// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanupTestOrg, createTestOrg, createTestRequest, createTestUser, hasDb } from '@/test/db-helpers';
import { query } from '@/lib/db/pool';
import { createAttachment, deleteAttachment } from '@/lib/db/queries/attachments';
import { listDocumentContext, selectDocumentContext, supportingDocuments } from './context';
import { beginAgentRun, finishAgentRun } from '@/lib/agents/runs';
import { DOCUMENT_LIMITS } from './limits';
const blob = vi.hoisted(() => ({ reads: 0 }));
vi.mock('@/lib/storage/blob', () => ({ readAttachment: async () => {
  blob.reads++;
  return { size: 24, contentType: 'text/plain', stream: new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode('Expected benefit\nEvidence')); controller.close();
  } }) };
} }));
afterEach(() => { blob.reads = 0; });
describe.skipIf(!hasDb())('authorized document context', () => {
  it('selects and processes text, provides source metadata, and removes extraction on deletion', async () => {
    const org = await createTestOrg('document-context'), user = await createTestUser(org, 'ADMIN');
    const request = await createTestRequest(org, user);
    const attachment = await createAttachment({ requestId: request.id, filename: 'evidence.txt', mimeType: 'text/plain', size: 24,
      url: 'https://unused.test/blob', storageKey: `orgs/${org.id}/requests/${request.id}/evidence.txt`, uploadedBy: user.id });
    try {
      await selectDocumentContext(attachment.id, org.id, user.id, true);
      expect(await listDocumentContext(request.id, org.id, user.id)).toMatchObject([{ attachmentId: attachment.id, status: 'PROCESSED', truncated: false }]);
      const bundle = await supportingDocuments(request.id, org.id, user.id);
      expect(bundle.sources).toMatchObject([{ attachmentId: attachment.id, filename: 'evidence.txt', text: 'Expected benefit\nEvidence', lineCount: 2 }]);
      await deleteAttachment(attachment.id, org.id);
      expect((await supportingDocuments(request.id, org.id, user.id)).sources).toEqual([]);
      expect((await query('SELECT * FROM attachment_context WHERE attachment_id=$1', [attachment.id])).rows).toHaveLength(0);
    } finally { await cleanupTestOrg(org, [user.id]); }
  });
  it('rejects cross-organization selection before reading any blob', async () => {
    const org = await createTestOrg('document-foreign'), foreign = await createTestOrg('other-document-org');
    const user = await createTestUser(org, 'ADMIN'), request = await createTestRequest(org, user);
    const attachment = await createAttachment({ requestId: request.id, filename: 'secret.txt', mimeType: 'text/plain', size: 24,
      url: 'https://unused.test/blob', storageKey: 'secret', uploadedBy: user.id });
    try {
      await expect(selectDocumentContext(attachment.id, foreign.id, user.id, true)).rejects.toThrow(/not found|membership/);
      expect(blob.reads).toBe(0);
    } finally { await cleanupTestOrg(foreign); await cleanupTestOrg(org, [user.id]); }
  });
  it('rejects unsupported formats without reading them', async () => {
    const org = await createTestOrg('document-format'), user = await createTestUser(org, 'ADMIN'), request = await createTestRequest(org, user);
    const attachment = await createAttachment({ requestId: request.id, filename: 'evidence.pdf', mimeType: 'application/pdf', size: 24,
      url: 'https://unused.test/blob', storageKey: 'pdf', uploadedBy: user.id });
    try {
      await expect(selectDocumentContext(attachment.id, org.id, user.id, true)).rejects.toThrow(/Plain text|Markdown/);
      expect(blob.reads).toBe(0);
    } finally { await cleanupTestOrg(org, [user.id]); }
  });
  it('enforces selection limits, protects active runs, and erases deselected extraction', async () => {
    const org = await createTestOrg('document-limits'), user = await createTestUser(org, 'ADMIN'), request = await createTestRequest(org, user);
    try {
      const attachments = [];
      for (let i = 0; i < 6; i++) {
        const attachment = await createAttachment({ requestId: request.id, filename: `${i}.txt`, mimeType: 'text/plain', size: 24,
          url: 'https://unused.test/blob', storageKey: `orgs/${org.id}/requests/${request.id}/${i}.txt`, uploadedBy: user.id });
        attachments.push(attachment);
        if (i < 5) await selectDocumentContext(attachment.id, org.id, user.id, true);
      }
      await expect(selectDocumentContext(attachments[5].id, org.id, user.id, true)).rejects.toThrow(/five/);
      expect(blob.reads).toBe(5);
      const run = await beginAgentRun({ requestId: request.id, orgId: org.id, userId: user.id, agent: 'intake' });
      await expect(selectDocumentContext(attachments[0].id, org.id, user.id, false)).rejects.toThrow(/active AI run/);
      await expect(deleteAttachment(attachments[0].id, org.id)).rejects.toThrow(/active AI run/);
      await finishAgentRun(run.id, 'FAILED');
      await selectDocumentContext(attachments[0].id, org.id, user.id, false);
      expect((await query('SELECT * FROM attachment_context WHERE attachment_id=$1', [attachments[0].id])).rows).toHaveLength(0);
      await selectDocumentContext(attachments[5].id, org.id, user.id, true);
      await query(`UPDATE attachment_context SET extracted_text=$2 WHERE attachment_id IN
        (SELECT id FROM attachments WHERE request_id=$1)`, [request.id, 'x'.repeat(DOCUMENT_LIMITS.textBytes)]);
      const bundle = await supportingDocuments(request.id, org.id, user.id);
      expect(bundle.sources).toHaveLength(2);
      expect(bundle.omitted).toHaveLength(3);
      expect(bundle.sources.reduce((sum, source) => sum + Buffer.byteLength(JSON.stringify(source)), 0)).toBeLessThanOrEqual(DOCUMENT_LIMITS.contextBytes);
      await query('DELETE FROM organization_users WHERE organization_id=$1 AND user_id=$2', [org.id, user.id]);
      expect((await supportingDocuments(request.id, org.id, user.id)).sources).toEqual([]);
      await expect(selectDocumentContext(attachments[5].id, org.id, user.id, false)).rejects.toThrow(/membership/);
    } finally { await cleanupTestOrg(org, [user.id]); }
  });
});
