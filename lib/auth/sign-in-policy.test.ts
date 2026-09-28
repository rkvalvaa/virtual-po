// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { query } from '@/lib/db/pool';
import { createInvitation } from '@/lib/db/queries/invitations';
import { cleanupTestOrg, createTestOrg, createTestUser, hasDb, type TestOrg, type TestUser } from '@/test/db-helpers';
import { hasPortalAccess, isSignInAllowed, mayRequestPortalLink } from './sign-in-policy';
import { addClientContact, createClientAccount } from '@/lib/db/queries/client-accounts';

describe.skipIf(!hasDb())('isSignInAllowed', () => {
  let org: TestOrg;
  let admin: TestUser;
  beforeAll(async () => {
    org = await createTestOrg('sign-in-policy');
    admin = await createTestUser(org, 'ADMIN');
  });
  afterAll(async () => { await cleanupTestOrg(org, [admin.id]); });
  afterEach(() => { delete process.env.ALLOWED_EMAIL_DOMAINS; });

  it('admits an existing organization member regardless of email case', async () => {
    expect(await isSignInAllowed(admin.email.toUpperCase())).toBe(true);
  });

  it('rejects an unknown email', async () => {
    expect(await isSignInAllowed(`nobody-${org.slug}@example.com`)).toBe(false);
    expect(await isSignInAllowed('')).toBe(false);
  });

  it('admits a pending invitation and rejects it once revoked or expired', async () => {
    const email = `invitee-${org.slug}@example.com`;
    const invite = await createInvitation(org.id, admin.id, email, 'STAKEHOLDER');
    expect(await isSignInAllowed(email)).toBe(true);

    await query('UPDATE organization_invitations SET expires_at = NOW() - INTERVAL \'1 minute\' WHERE id = $1', [invite.id]);
    expect(await isSignInAllowed(email)).toBe(false);

    await query('UPDATE organization_invitations SET expires_at = NOW() + INTERVAL \'1 day\', revoked_at = NOW() WHERE id = $1', [invite.id]);
    expect(await isSignInAllowed(email)).toBe(false);
  });

  it('admits any address on an allowlisted domain', async () => {
    process.env.ALLOWED_EMAIL_DOMAINS = 'Example.org, partner.example';
    expect(await isSignInAllowed('anyone@example.org')).toBe(true);
    expect(await isSignInAllowed('anyone@partner.example')).toBe(true);
    expect(await isSignInAllowed('anyone@other.example')).toBe(false);
  });
});

describe.skipIf(!hasDb())('portal email links', () => {
  let org: TestOrg;
  let admin: TestUser;
  let accountId: string;
  let contactId: string;
  const email = `portal-${crypto.randomUUID()}@client.example`;
  beforeAll(async () => {
    org = await createTestOrg('portal-policy');
    admin = await createTestUser(org, 'ADMIN');
    accountId = (await createClientAccount(org.id, admin.id, 'Policy client')).id;
    contactId = (await addClientContact(org.id, admin.id, accountId, email)).id;
  });
  afterAll(async () => {
    await query('DELETE FROM verification_tokens WHERE identifier = $1', [email]);
    await cleanupTestOrg(org, [admin.id]);
  });

  it('offers a link to an active contact only', async () => {
    expect(await hasPortalAccess(email)).toBe(true);
    expect(await mayRequestPortalLink(email)).toBe(true);
    expect(await mayRequestPortalLink(`nobody-${crypto.randomUUID()}@client.example`)).toBe(false);
  });

  it('refuses a revoked contact and a contact of an archived client', async () => {
    await query('UPDATE client_contacts SET revoked_at = NOW() WHERE id = $1', [contactId]);
    expect(await mayRequestPortalLink(email)).toBe(false);
    expect(await hasPortalAccess(email)).toBe(false);
    await query('UPDATE client_contacts SET revoked_at = NULL WHERE id = $1', [contactId]);
    await query('UPDATE client_accounts SET archived_at = NOW() WHERE id = $1', [accountId]);
    expect(await hasPortalAccess(email)).toBe(false);
    await query('UPDATE client_accounts SET archived_at = NULL WHERE id = $1', [accountId]);
  });

  it('stops issuing links once three are outstanding', async () => {
    for (let i = 0; i < 3; i++) {
      await query(`INSERT INTO verification_tokens (identifier, token, expires) VALUES ($1, $2, NOW() + INTERVAL '10 minutes')`, [email, `t-${i}-${crypto.randomUUID()}`]);
    }
    expect(await mayRequestPortalLink(email)).toBe(false);
    expect(await hasPortalAccess(email)).toBe(true);
  });
});
