// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { cleanupTestOrg, createTestOrg, createTestRequest, createTestUser, hasDb, type TestOrg } from '@/test/db-helpers';
import { query } from '@/lib/db/pool';
import { changeOrganizationMember } from './organization-members';
import { getOrganizationRole } from './organizations';

describe.skipIf(!hasDb())('safe member administration', () => {
  const fixtures: { org: TestOrg; users: string[] }[] = [];
  async function setup() {
    const org = await createTestOrg('member-admin');
    const admin = await createTestUser(org, 'ADMIN');
    const member = await createTestUser(org, 'REVIEWER');
    fixtures.push({ org, users: [admin.id, member.id] });
    return { org, admin, member };
  }
  afterEach(async () => { for (const { org, users } of fixtures.splice(0)) await cleanupTestOrg(org, users); });
  it('refuses last-admin removal or demotion', async () => {
    const { org, admin } = await setup();
    for (const operation of [{ kind: 'remove' as const }, { kind: 'role' as const, role: 'REVIEWER' as const }]) {
      await expect(changeOrganizationMember(org.id, admin.id, admin.id, operation)).rejects.toThrow(/last administrator/i);
    }
    expect(await getOrganizationRole(org.id, admin.id)).toBe('ADMIN');
  });
  it('prevents concurrent self-demotions from eliminating all administrators', async () => {
    const { org, admin, member } = await setup();
    await changeOrganizationMember(org.id, admin.id, member.id, { kind: 'role', role: 'ADMIN' });
    const results = await Promise.allSettled([admin, member].map(user => changeOrganizationMember(org.id, user.id, user.id, { kind: 'role', role: 'REVIEWER' })));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect((await query("SELECT user_id FROM organization_users WHERE organization_id = $1 AND role = 'ADMIN'", [org.id])).rows).toHaveLength(1);
  });
  it('hands over administration atomically and rejects the former admin afterward', async () => {
    const { org, admin, member } = await setup();
    await changeOrganizationMember(org.id, admin.id, member.id, { kind: 'handover' });
    expect(await getOrganizationRole(org.id, admin.id)).toBe('REVIEWER');
    expect(await getOrganizationRole(org.id, member.id)).toBe('ADMIN');
    await expect(changeOrganizationMember(org.id, admin.id, member.id, { kind: 'remove' })).rejects.toThrow();
    expect((await query("SELECT metadata FROM activity_log WHERE organization_id = $1 AND action = 'MEMBER_UPDATED'", [org.id])).rows[0].metadata).toMatchObject({ operation: 'handover', targetUserId: member.id });
  });
  it('removes access and assignments while preserving authored requests', async () => {
    const { org, admin, member } = await setup();
    const request = await createTestRequest(org, member);
    await query('UPDATE feature_requests SET assignee_id = $1 WHERE id = $2', [member.id, request.id]);
    await changeOrganizationMember(org.id, admin.id, member.id, { kind: 'remove' });
    expect(await getOrganizationRole(org.id, member.id)).toBeNull();
    expect((await query('SELECT requester_id, assignee_id FROM feature_requests WHERE id = $1', [request.id])).rows[0]).toEqual({ requester_id: member.id, assignee_id: null });
  });
  it('rejects foreign targets and non-admin actors', async () => {
    const local = await setup(), foreign = await setup();
    await expect(changeOrganizationMember(local.org.id, local.admin.id, foreign.member.id, { kind: 'remove' })).rejects.toThrow();
    await expect(changeOrganizationMember(local.org.id, local.member.id, local.admin.id, { kind: 'remove' })).rejects.toThrow();
    expect(await getOrganizationRole(foreign.org.id, foreign.member.id)).toBe('REVIEWER');
  });
  it('requires reassignment of named approval steps before removal or loss of review access', async () => {
    const { org, admin, member } = await setup();
    const workflow = await query('INSERT INTO approval_workflows (organization_id, name) VALUES ($1, $2) RETURNING id', [org.id, 'Named gate']);
    await query('INSERT INTO approval_steps (workflow_id, step_order, name, approver_user_id) VALUES ($1, 1, $2, $3)', [workflow.rows[0].id, 'Review', member.id]);
    await expect(changeOrganizationMember(org.id, admin.id, member.id, { kind: 'remove' })).rejects.toThrow('Reassign');
    await expect(changeOrganizationMember(org.id, admin.id, member.id, { kind: 'role', role: 'STAKEHOLDER' })).rejects.toThrow('Reassign');
    expect(await getOrganizationRole(org.id, member.id)).toBe('REVIEWER');
  });
});
