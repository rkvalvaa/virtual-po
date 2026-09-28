import { expect, test } from '@playwright/test';
import crypto from 'node:crypto';
import { cleanupTestOrg, createTestOrg, createTestUser } from '@/test/db-helpers';
import { addClientContact, createClientAccount } from '@/lib/db/queries/client-accounts';
import { query } from '@/lib/db/pool';
import { portalLink } from './helpers/auth';

test('without email configured, every address sees the same message and no link is created', async ({ page }) => {
  test.skip(!!process.env.RESEND_API_KEY, 'needs email to be unconfigured');
  const org = await createTestOrg('e2e-portal-unavailable');
  const admin = await createTestUser(org, 'ADMIN');
  const known = `contact-${crypto.randomUUID()}@client.example`;
  const unknown = `nobody-${crypto.randomUUID()}@client.example`;
  const account = await createClientAccount(org.id, admin.id, 'E2E unavailable client');
  await addClientContact(org.id, admin.id, account.id, known);
  try {
    for (const email of [known, unknown]) {
      await page.goto('/portal/login');
      await page.getByLabel('Email').fill(email);
      await page.getByRole('button', { name: 'Email me a sign-in link' }).click();
      await expect(page.getByRole('main').getByRole('alert')).toHaveText(/unavailable right now/);
      expect((await query('SELECT 1 FROM verification_tokens WHERE identifier = $1', [email])).rowCount).toBe(0);
    }
  } finally {
    await cleanupTestOrg(org, [admin.id]);
  }
});

test('a client contact signs in with a one-time link and lands in the portal', async ({ page }) => {
  const org = await createTestOrg('e2e-portal-link');
  const admin = await createTestUser(org, 'ADMIN');
  const email = `contact-${crypto.randomUUID()}@client.example`;
  const account = await createClientAccount(org.id, admin.id, 'E2E link client');
  await addClientContact(org.id, admin.id, account.id, email);
  try {
    const link = await portalLink(email);
    await page.goto(link);
    await expect(page).toHaveURL(/\/portal$/);
    await expect(page.getByRole('heading', { name: 'Client portal' })).toBeVisible();

    const contact = await query<{ user_id: string | null }>('SELECT user_id FROM client_contacts WHERE email = $1', [email]);
    expect(contact.rows[0].user_id).not.toBeNull();
    expect((await query('SELECT 1 FROM organization_users WHERE user_id = $1', [contact.rows[0].user_id])).rowCount).toBe(0);

    await page.context().clearCookies();
    await page.goto(link);
    await expect(page.getByText(/expired or was already used/)).toBeVisible();
  } finally {
    await query('DELETE FROM users WHERE email = $1', [email]);
    await cleanupTestOrg(org, [admin.id]);
  }
});
