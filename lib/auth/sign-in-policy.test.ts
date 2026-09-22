// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { query } from '@/lib/db/pool';
import { createInvitation } from '@/lib/db/queries/invitations';
import { cleanupTestOrg, createTestOrg, createTestUser, hasDb, type TestOrg, type TestUser } from '@/test/db-helpers';
import { isSignInAllowed } from './sign-in-policy';

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
