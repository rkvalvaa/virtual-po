// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupTestOrg, createTestChangeRequest, createTestOrg, createTestUser, hasDb, type TestOrg, type TestUser } from '@/test/db-helpers'
import { query } from '@/lib/db/pool'
import { createServiceGroup, setGroupMember } from './service-groups'
import { claimRequest, listGroupQueue, listQueueGroups, moveRequestToGroup, reassignRequest } from './group-queue'

describe.skipIf(!hasDb())('service group queues', () => {
  let org: TestOrg
  let admin: TestUser, lead: TestUser, member: TestUser, other: TestUser, outsider: TestUser
  let groupId: string, otherGroupId: string

  beforeAll(async () => {
    org = await createTestOrg('group-queue')
    admin = await createTestUser(org, 'ADMIN')
    lead = await createTestUser(org, 'STAKEHOLDER')
    member = await createTestUser(org, 'STAKEHOLDER')
    other = await createTestUser(org, 'STAKEHOLDER')
    outsider = await createTestUser(org, 'REVIEWER')
    groupId = (await createServiceGroup(org.id, admin.id, { name: 'IT Operations', fallbackOwnerId: admin.id })).id
    otherGroupId = (await createServiceGroup(org.id, admin.id, { name: 'Facilities', fallbackOwnerId: admin.id })).id
    await setGroupMember(org.id, admin.id, groupId, { userId: lead.id, role: 'LEAD' })
    await setGroupMember(org.id, admin.id, groupId, { userId: member.id, role: 'MEMBER' })
    await setGroupMember(org.id, admin.id, groupId, { userId: other.id, role: 'MEMBER' })
  })
  afterAll(async () => { await cleanupTestOrg(org, [admin.id, lead.id, member.id, other.id, outsider.id]) })

  async function inGroup(title: string, group = groupId) {
    const { id } = await createTestChangeRequest(org, outsider, title)
    await query('UPDATE feature_requests SET service_group_id = $2 WHERE id = $1', [id, group])
    return id
  }
  const scope = (user: TestUser) => ({ orgId: org.id, userId: user.id })
  const assignee = async (id: string) => (await query('SELECT assignee_id, service_group_id FROM feature_requests WHERE id = $1', [id])).rows[0]
  const assignments = async (id: string) => (await query<{ metadata: Record<string, unknown> }>(
    `SELECT metadata FROM activity_log WHERE request_id = $1 AND action = 'ASSIGNMENT_CHANGED' ORDER BY created_at, id`, [id])).rows.map(r => r.metadata)

  it('shows a queue only to its members and admins, oldest first, with filters', async () => {
    const first = await inGroup('First in line')
    const second = await inGroup('Second in line')
    await inGroup('Somebody else', otherGroupId)
    await query(`UPDATE feature_requests SET created_at = NOW() - interval '2 days' WHERE id = $1`, [first])

    expect((await listQueueGroups(org.id, member.id, 'STAKEHOLDER')).map(g => g.name)).toEqual(['IT Operations'])
    expect((await listQueueGroups(org.id, admin.id, 'ADMIN')).map(g => g.name)).toEqual(['Facilities', 'IT Operations'])
    expect(await listQueueGroups(org.id, outsider.id, 'REVIEWER')).toEqual([])

    const queue = await listGroupQueue(org.id, member.id, 'STAKEHOLDER', groupId, {})
    expect(queue!.map(r => r.title).slice(0, 2)).toEqual(['First in line', 'Second in line'])
    expect(queue!.every(r => r.stateLabel && r.assigneeId === null)).toBe(true)
    expect(await listGroupQueue(org.id, outsider.id, 'REVIEWER', groupId, {})).toBeNull()
    expect(await listGroupQueue(org.id, admin.id, 'ADMIN', groupId, {})).not.toBeNull()

    await claimRequest({ ...scope(member), requestId: second })
    expect((await listGroupQueue(org.id, member.id, 'STAKEHOLDER', groupId, { assignee: 'me' }))!.map(r => r.id)).toEqual([second])
    expect((await listGroupQueue(org.id, member.id, 'STAKEHOLDER', groupId, { assignee: 'unassigned' }))!.map(r => r.id)).toContain(first)
    expect((await listGroupQueue(org.id, member.id, 'STAKEHOLDER', groupId, { state: 'CLOSED' }))).toEqual([])
  })

  it('lets a member claim once, and refuses claims from outside the group', async () => {
    const id = await inGroup('Claim me')
    await expect(claimRequest({ ...scope(outsider), requestId: id })).rejects.toThrow(/member of IT Operations/)
    await claimRequest({ ...scope(member), requestId: id })
    expect((await assignee(id)).assignee_id).toBe(member.id)
    await expect(claimRequest({ ...scope(other), requestId: id })).rejects.toThrow(/already claimed/)
    expect(await assignments(id)).toEqual([expect.objectContaining({ operation: 'claim', to: member.id })])
    const notified = await query(`SELECT 1 FROM notifications WHERE user_id = $1 AND link = $2`, [member.id, `/requests/${id}`])
    expect(notified.rowCount).toBe(0)
  })

  it('gives one winner and a clear error when two members claim at once', async () => {
    const id = await inGroup('Race')
    const results = await Promise.allSettled([claimRequest({ ...scope(member), requestId: id }), claimRequest({ ...scope(other), requestId: id })])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    const loser = results.find(r => r.status === 'rejected') as PromiseRejectedResult
    expect(loser.reason.message).toMatch(/already claimed/)
    expect(await assignments(id)).toHaveLength(1)
  })

  it('lets leads and admins reassign within the group, with a reason, from the assignment they saw', async () => {
    const id = await inGroup('Reassign me')
    await claimRequest({ ...scope(member), requestId: id })
    const reassign = (user: TestUser, extra: { toUserId?: string; reason?: string; expectedAssigneeId?: string | null } = {}) =>
      reassignRequest({ ...scope(user), requestId: id, expectedAssigneeId: member.id, toUserId: other.id, reason: 'Member is on leave', ...extra })

    await expect(reassign(member)).rejects.toThrow(/lead/i)
    await expect(reassign(lead, { reason: '  ' })).rejects.toThrow(/reason/i)
    await expect(reassign(lead, { toUserId: outsider.id })).rejects.toThrow(/member of IT Operations/)
    await expect(reassign(lead, { expectedAssigneeId: null })).rejects.toThrow(/changed/)
    await reassign(lead)
    expect((await assignee(id)).assignee_id).toBe(other.id)
    await reassignRequest({ ...scope(admin), requestId: id, expectedAssigneeId: other.id, toUserId: lead.id, reason: 'Needs a lead' })

    expect((await assignments(id)).map(m => [m.operation, m.from, m.to, m.reason])).toEqual([
      ['claim', null, member.id, undefined], ['reassign', member.id, other.id, 'Member is on leave'], ['reassign', other.id, lead.id, 'Needs a lead'],
    ])
    const notified = await query(`SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = $1 AND link = $2`, [other.id, `/requests/${id}`])
    expect(notified.rows[0].n).toBe(1)
  })

  it('moves a request to another group with a reason, leaving it unassigned there', async () => {
    const id = await inGroup('Wrong group')
    await claimRequest({ ...scope(member), requestId: id })
    const move = (user: TestUser, reason = 'Belongs to Facilities', toGroupId = otherGroupId) =>
      moveRequestToGroup({ ...scope(user), requestId: id, expectedGroupId: groupId, toGroupId, reason })

    await expect(move(member)).rejects.toThrow(/lead/i)
    await expect(move(lead, '')).rejects.toThrow(/reason/i)
    await expect(move(lead, 'x', groupId)).rejects.toThrow(/already/)
    await move(lead)
    expect(await assignee(id)).toEqual({ assignee_id: null, service_group_id: otherGroupId })
    await expect(move(lead)).rejects.toThrow(/changed/)
    expect((await assignments(id)).at(-1)).toMatchObject({ operation: 'move', fromGroup: groupId, toGroup: otherGroupId, from: member.id, to: null, reason: 'Belongs to Facilities' })
  })
})
