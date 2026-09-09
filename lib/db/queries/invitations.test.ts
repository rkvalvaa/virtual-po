// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { cleanupTestOrg, createTestOrg, createTestUser, hasDb, type TestOrg } from '@/test/db-helpers';
import { query } from '@/lib/db/pool';
import { createInvitation, acceptInvitation, revokeInvitation, resendInvitation } from './invitations';
import { getOrganizationRole, getUserOrganizations } from './organizations';

describe.skipIf(!hasDb())('secure organization invitations', () => {
  const fixtures: { org: TestOrg; users: string[] }[] = [];
  async function setup() {
    const org = await createTestOrg('invites');
    const home = await createTestOrg('recipient-home');
    const admin = await createTestUser(org, 'ADMIN');
    const recipient = await createTestUser(home);
    fixtures.push({ org, users: [admin.id] }, { org: home, users: [recipient.id] });
    return { org, home, admin, recipient };
  }
  afterEach(async () => { for (const { org, users } of fixtures.splice(0)) await cleanupTestOrg(org, users); });
  it('stores only a hash and grants the chosen role without losing existing workspaces', async () => {
    const { org, home, admin, recipient } = await setup();
    const invite = await createInvitation(org.id, admin.id, recipient.email.toUpperCase(), 'REVIEWER');
    const stored = (await query('SELECT * FROM organization_invitations WHERE id = $1', [invite.id])).rows[0];
    expect(stored.token_hash).toBe(createHash('sha256').update(invite.token).digest('hex'));
    expect(JSON.stringify(stored)).not.toContain(invite.token);
    expect(await acceptInvitation(invite.token, recipient.id)).toMatchObject({ orgId: org.id });
    expect(await getOrganizationRole(org.id, recipient.id)).toBe('REVIEWER');
    expect((await getUserOrganizations(recipient.id)).map(row => row.id).sort()).toEqual([org.id, home.id].sort());
    expect(await acceptInvitation(invite.token, recipient.id)).toMatchObject({ orgId: org.id });
  });
  it('rejects a different authenticated account', async () => {
    const { org, admin, recipient } = await setup();
    const invite = await createInvitation(org.id, admin.id, recipient.email, 'REVIEWER');
    await expect(acceptInvitation(invite.token, admin.id)).rejects.toThrow(/account/i);
    expect(await getOrganizationRole(org.id, recipient.id)).toBeNull();
  });
  it('rejects expired and revoked tokens', async () => {
    const { org, admin, recipient } = await setup();
    const invite = await createInvitation(org.id, admin.id, recipient.email, 'REVIEWER');
    await query("UPDATE organization_invitations SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1", [invite.id]);
    await expect(acceptInvitation(invite.token, recipient.id)).rejects.toThrow(/expired/i);
    const resent = await resendInvitation(org.id, admin.id, invite.id);
    await revokeInvitation(org.id, admin.id, invite.id);
    await expect(acceptInvitation(resent.token, recipient.id)).rejects.toThrow(/revoked/i);
  });
  it('rotates the token on resend and does not restore a removed membership on replay', async () => {
    const { org, admin, recipient } = await setup();
    const invite = await createInvitation(org.id, admin.id, recipient.email, 'REVIEWER');
    const resent = await resendInvitation(org.id, admin.id, invite.id);
    await expect(acceptInvitation(invite.token, recipient.id)).rejects.toThrow();
    await acceptInvitation(resent.token, recipient.id);
    await query('DELETE FROM organization_users WHERE organization_id = $1 AND user_id = $2', [org.id, recipient.id]);
    await expect(acceptInvitation(resent.token, recipient.id)).rejects.toThrow();
  });
  it('preserves the role of an existing member instead of elevating privileges on acceptance', async () => {
    const { org, admin, recipient } = await setup();
    const invite = await createInvitation(org.id, admin.id, recipient.email, 'ADMIN');
    await query("INSERT INTO organization_users (organization_id, user_id, role) VALUES ($1, $2, 'STAKEHOLDER')", [org.id, recipient.id]);
    await acceptInvitation(invite.token, recipient.id);
    expect(await getOrganizationRole(org.id, recipient.id)).toBe('STAKEHOLDER');
  });
  it('serializes simultaneous acceptances and denies foreign invitation administration', async () => {
    const { org, home, admin, recipient } = await setup();
    const invite = await createInvitation(org.id, admin.id, recipient.email, 'REVIEWER');
    await expect(revokeInvitation(home.id, recipient.id, invite.id)).rejects.toThrow();
    await expect(resendInvitation(home.id, recipient.id, invite.id)).rejects.toThrow();
    await expect(createInvitation(home.id, admin.id, recipient.email, 'ADMIN')).rejects.toThrow();
    const results = await Promise.all([acceptInvitation(invite.token, recipient.id), acceptInvitation(invite.token, recipient.id)]);
    expect(results.every(result => result.orgId === org.id)).toBe(true);
    expect((await query('SELECT * FROM organization_users WHERE organization_id = $1 AND user_id = $2', [org.id, recipient.id])).rows).toHaveLength(1);
  });
});
