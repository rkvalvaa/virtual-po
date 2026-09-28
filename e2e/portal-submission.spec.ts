import { expect, test } from '@playwright/test';
import crypto from 'node:crypto';
import { cleanupTestOrg, createTestOrg, createTestUser } from '@/test/db-helpers';
import { addClientContact, createClientAccount } from '@/lib/db/queries/client-accounts';
import { createForm, publishForm, saveFormDraft } from '@/lib/db/queries/intake-forms';
import { query } from '@/lib/db/pool';
import { loginAs, portalLink } from './helpers/auth';

test('a client contact submits a published form and a reviewer sees where it came from', async ({ page, browser }) => {
  const org = await createTestOrg('e2e-portal-submit');
  const admin = await createTestUser(org, 'ADMIN');
  const reviewer = await createTestUser(org, 'REVIEWER');
  const email = `submitter-${crypto.randomUUID()}@client.example`;
  const client = await createClientAccount(org.id, admin.id, 'E2E submitting client');
  await addClientContact(org.id, admin.id, client.id, email);
  const { id: formId } = await createForm(org.id, admin.id, client.id, 'Listing change');
  await saveFormDraft(org.id, admin.id, formId, {
    title: 'Listing change', instructions: 'Tell us what to change.', titleFieldKey: 'summary', maxAttachments: 0,
    fields: [
      { key: 'summary', label: 'Summary', type: 'TEXT', required: true, options: [], showIf: null },
      { key: 'area', label: 'Area', type: 'SELECT', required: true, options: ['Listings', 'Search'], showIf: null },
      { key: 'listing_url', label: 'Listing URL', type: 'TEXT', required: true, options: [], showIf: { fieldKey: 'area', equals: 'Listings' } },
    ],
  });
  await publishForm(org.id, admin.id, formId);
  try {
    await page.goto(await portalLink(email));
    await page.getByRole('main').getByRole('link', { name: 'Listing change' }).click();
    await page.getByLabel(/Summary/).fill('Replace the hero image');
    await page.getByLabel(/Area/).selectOption('Listings');
    await page.getByLabel(/Listing URL/).fill('https://portal.example/listing/42');
    await page.getByRole('button', { name: 'Submit request' }).click();

    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { name: 'Received' })).toBeVisible();
    const reference = (await main.locator('.font-mono').innerText()).trim();
    expect(reference).toMatch(/^[A-Z2-9]{10}$/);

    const row = await query<{ id: string; status: string; title: string }>(
      'SELECT id, status, title FROM feature_requests WHERE public_reference = $1', [reference]);
    expect(row.rows[0]).toMatchObject({ status: 'UNDER_REVIEW', title: 'Replace the hero image' });

    const internal = await browser.newPage();
    try {
      await loginAs(internal, reviewer.email);
      await internal.goto(`/requests/${row.rows[0].id}`);
      const origin = internal.getByRole('main');
      await expect(origin.getByText('Submitted through the client portal')).toBeVisible();
      await expect(origin.getByText('E2E submitting client')).toBeVisible();
      await expect(origin.getByText('https://portal.example/listing/42')).toBeVisible();
    } finally { await internal.close(); }
  } finally {
    await cleanupTestOrg(org, [admin.id, reviewer.id]);
    await query('DELETE FROM users WHERE email = $1', [email]);
  }
});
