// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupTestOrg, createTestChangeRequest, createTestOrg, createTestUser, hasDb, type TestOrg, type TestUser } from '@/test/db-helpers'
import { query } from '@/lib/db/pool'
import {
  archiveServiceGroup, createServiceGroup, listServiceGroups, removeGroupMember, renameServiceGroup, setFallbackOwner, setGroupMember,
} from './service-groups'
import { changeOrganizationMember } from './organization-members'

describe.skipIf(!hasDb())('service groups', () => {
  let org: TestOrg
  let otherOrg: TestOrg
  let admin: TestUser
  let reviewer: TestUser
  let member: TestUser
  let outsider: TestUser
  let contactUserId: string

  beforeAll(async () => {
    org = await createTestOrg('service-groups')
    otherOrg = await createTestOrg('service-groups-other')
    admin = await createTestUser(org, 'ADMIN')
    reviewer = await createTestUser(org, 'REVIEWER')
    member = await createTestUser(org, 'STAKEHOLDER')
    outsider = await createTestUser(otherOrg, 'ADMIN')
    // A signed-in client contact has a users row but no workspace membership.
    contactUserId = (await query<{ id: string }>('INSERT INTO users (email) VALUES ($1) RETURNING id', [`contact-${crypto.randomUUID()}@client.example`])).rows[0].id
  })
  afterAll(async () => {
    await cleanupTestOrg(org, [admin.id, reviewer.id, member.id, contactUserId])
    await cleanupTestOrg(otherOrg, [outsider.id])
  })

  it('lets an admin create, staff, rename and list groups, scoped to the workspace', async () => {
    const { id } = await createServiceGroup(org.id, admin.id, { name: 'IT Operations', fallbackOwnerId: admin.id })
    await setGroupMember(org.id, admin.id, id, { userId: reviewer.id, role: 'LEAD' })
    await setGroupMember(org.id, admin.id, id, { userId: member.id, role: 'MEMBER' })
    await setGroupMember(org.id, admin.id, id, { userId: member.id, role: 'LEAD' })
    await renameServiceGroup(org.id, admin.id, id, 'IT Ops')

    const [group] = (await listServiceGroups(org.id)).filter(g => g.id === id)
    expect(group).toMatchObject({ name: 'IT Ops', fallbackOwnerId: admin.id })
    expect(group.members.map(m => [m.userId, m.role]).sort()).toEqual([[member.id, 'LEAD'], [reviewer.id, 'LEAD']].sort())
    expect((await listServiceGroups(otherOrg.id)).map(g => g.id)).not.toContain(id)

    await removeGroupMember(org.id, admin.id, id, member.id)
    expect((await listServiceGroups(org.id)).find(g => g.id === id)?.members.map(m => m.userId)).toEqual([reviewer.id])
  })

  it('refuses anyone but a current admin, and groups from another workspace', async () => {
    await expect(createServiceGroup(org.id, reviewer.id, { name: 'Facilities', fallbackOwnerId: reviewer.id })).rejects.toThrow(/administrator/)
    const { id } = await createServiceGroup(org.id, admin.id, { name: 'Facilities', fallbackOwnerId: admin.id })
    await expect(renameServiceGroup(otherOrg.id, outsider.id, id, 'Stolen')).rejects.toThrow(/not found/i)
    await expect(setGroupMember(otherOrg.id, outsider.id, id, { userId: outsider.id, role: 'LEAD' })).rejects.toThrow(/not found/i)
  })

  it('only accepts current workspace members, never another workspace or a client contact', async () => {
    const { id } = await createServiceGroup(org.id, admin.id, { name: 'Security', fallbackOwnerId: admin.id })
    await expect(setGroupMember(org.id, admin.id, id, { userId: outsider.id, role: 'MEMBER' })).rejects.toThrow(/member of this workspace/)
    await expect(setGroupMember(org.id, admin.id, id, { userId: contactUserId, role: 'MEMBER' })).rejects.toThrow(/member of this workspace/)
    await expect(setFallbackOwner(org.id, admin.id, id, outsider.id)).rejects.toThrow(/member of this workspace/)
    await expect(createServiceGroup(org.id, admin.id, { name: 'Payroll', fallbackOwnerId: contactUserId })).rejects.toThrow(/member of this workspace/)
  })

  it('keeps active names unique but frees a name once its group is archived', async () => {
    const { id } = await createServiceGroup(org.id, admin.id, { name: 'Service Desk', fallbackOwnerId: admin.id })
    await expect(createServiceGroup(org.id, admin.id, { name: ' service desk ', fallbackOwnerId: admin.id })).rejects.toThrow(/already exists/)
    await archiveServiceGroup(org.id, admin.id, id)
    expect((await listServiceGroups(org.id)).map(g => g.id)).not.toContain(id)
    await expect(createServiceGroup(org.id, admin.id, { name: 'Service Desk', fallbackOwnerId: admin.id })).resolves.toMatchObject({ id: expect.any(String) })
  })

  it('never removes a fallback owner of an active group, and hands their group requests to the fallback owner', async () => {
    const leaver = await createTestUser(org, 'REVIEWER')
    const { id: active } = await createServiceGroup(org.id, admin.id, { name: 'Network', fallbackOwnerId: leaver.id })
    const { id: archived } = await createServiceGroup(org.id, admin.id, { name: 'Old desk', fallbackOwnerId: leaver.id })
    await archiveServiceGroup(org.id, admin.id, archived)
    await setGroupMember(org.id, admin.id, active, { userId: leaver.id, role: 'LEAD' })
    const inGroup = (await createTestChangeRequest(org, admin, 'Grouped')).id
    const loose = (await createTestChangeRequest(org, admin, 'Ungrouped')).id
    await query('UPDATE feature_requests SET service_group_id = $2, assignee_id = $3 WHERE id = $1', [inGroup, active, leaver.id])
    await query('UPDATE feature_requests SET assignee_id = $2 WHERE id = $1', [loose, leaver.id])

    await expect(changeOrganizationMember(org.id, admin.id, leaver.id, { kind: 'remove' })).rejects.toThrow(/fallback owner for "Network"/)
    await setFallbackOwner(org.id, admin.id, active, reviewer.id)
    await changeOrganizationMember(org.id, admin.id, leaver.id, { kind: 'remove' })

    const assignees = await query('SELECT id, assignee_id FROM feature_requests WHERE id = ANY($1)', [[inGroup, loose]])
    expect(Object.fromEntries(assignees.rows.map(r => [r.id, r.assignee_id]))).toEqual({ [inGroup]: reviewer.id, [loose]: null })
    expect((await listServiceGroups(org.id)).find(g => g.id === active)?.members.map(m => m.userId)).toEqual([])
    expect((await query('SELECT fallback_owner_id FROM service_groups WHERE id = $1', [archived])).rows[0].fallback_owner_id).toBeNull()
    await query('DELETE FROM users WHERE id = $1', [leaver.id])
  })
})
