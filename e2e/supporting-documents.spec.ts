import { expect, test } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { cleanupTestOrg, createTestOrg, createTestRequest, createTestUser } from '@/test/db-helpers';
import { createAttachment } from '@/lib/db/queries/attachments';
import { query } from '@/lib/db/pool';

test('selected document status, citations and deselection remain consistent after reload', async ({ page }) => {
  const org = await createTestOrg('Document evidence');
  const user = await createTestUser(org, 'ADMIN');
  const request = await createTestRequest(org, user, 'Document-grounded assessment');
  const attachment = await createAttachment({ requestId: request.id, filename: 'evidence.md', mimeType: 'text/markdown', size: 24,
    url: 'https://unused.test/blob', storageKey: `orgs/${org.id}/requests/${request.id}/evidence.md`, uploadedBy: user.id });
  try {
    await query(`INSERT INTO attachment_context(attachment_id,status,processing_token,extracted_text,content_hash,line_count,truncated)
      VALUES($1,'PROCESSED',gen_random_uuid(),'Evidence for a claim','hash',1,TRUE)`, [attachment.id]);
    await query(`UPDATE feature_requests SET assessment_data=$2 WHERE id=$1`, [request.id, JSON.stringify({
      documentCitations: [{ attachmentId: attachment.id, filename: attachment.filename, contentHash: 'hash', startLine: 1, endLine: 1, claim: 'A supported assessment conclusion.' }],
    })]);
    await loginAs(page, user.email);
    await page.goto(`/requests/${request.id}`);
    const selected = page.getByRole('checkbox', { name: 'Use evidence.md in AI assessments' });
    await expect(selected).toBeChecked();
    await expect(page.getByText(/Processed.*truncated/)).toBeVisible();
    await page.getByRole('tab', { name: 'Assessment', exact: true }).click();
    await expect(page.getByText('A supported assessment conclusion.')).toBeVisible();
    await expect(page.getByRole('link', { name: /evidence.md.*lines/ })).toHaveAttribute('href', `/api/attachments/${attachment.id}`);
    await page.getByRole('tab', { name: 'Overview', exact: true }).click();
    await selected.click();
    await expect(selected).not.toBeChecked();
    await expect.poll(async () => (await query('SELECT id FROM attachments JOIN attachment_context ON attachment_id=id WHERE id=$1', [attachment.id])).rowCount).toBe(0);
    await page.reload();
    await expect(selected).not.toBeChecked();
    await query('DELETE FROM attachments WHERE id=$1', [attachment.id]);
    await page.reload();
    await page.getByRole('tab', { name: 'Assessment', exact: true }).click();
    await expect(page.getByText(/Source removed: evidence.md/)).toBeVisible();
    await expect(page.getByRole('link', { name: /evidence.md.*lines/ })).toHaveCount(0);
  } finally {
    await page.goto('about:blank');
    await cleanupTestOrg(org, [user.id]);
  }
});
