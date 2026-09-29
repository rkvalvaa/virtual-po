// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanupTestOrg, createTestChangeRequest, createTestOrg, createTestUser, hasDb, type TestOrg, type TestUser } from '@/test/db-helpers'
import { query } from '@/lib/db/pool'
import { createServiceGroup, setGroupMember } from '@/lib/db/queries/service-groups'

const actor = vi.hoisted(() => ({ id: '', orgId: '', role: 'STAKEHOLDER' }))
vi.mock('@/lib/auth/session', () => ({ requireAuth: async () => ({ user: actor }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { claimQueueRequest, moveQueueRequest, reassignQueueRequest } from './actions'

describe.skipIf(!hasDb())('queue actions', () => {
  let org: TestOrg
  let admin: TestUser, member: TestUser, outsider: TestUser
  let groupId: string, otherGroupId: string

  beforeAll(async () => {
    org = await createTestOrg('queue-actions')
    admin = await createTestUser(org, 'ADMIN')
    member = await createTestUser(org, 'STAKEHOLDER')
    outsider = await createTestUser(org, 'REVIEWER')
    groupId = (await createServiceGroup(org.id, admin.id, { name: 'IT Operations', fallbackOwnerId: admin.id })).id
    otherGroupId = (await createServiceGroup(org.id, admin.id, { name: 'Facilities', fallbackOwnerId: admin.id })).id
    await setGroupMember(org.id, admin.id, groupId, { userId: member.id, role: 'MEMBER' })
  })
  beforeEach(() => Object.assign(actor, { id: member.id, orgId: org.id, role: 'STAKEHOLDER' }))
  afterAll(async () => { await cleanupTestOrg(org, [admin.id, member.id, outsider.id]) })

  async function inGroup() {
    const { id } = await createTestChangeRequest(org, outsider)
    await query('UPDATE feature_requests SET service_group_id = $2 WHERE id = $1', [id, groupId])
    return id
  }

  it('claims for a member and refuses someone outside the group', async () => {
    const id = await inGroup()
    Object.assign(actor, { id: outsider.id, role: 'REVIEWER' })
    expect(await claimQueueRequest(id)).toEqual({ error: 'Only a member of IT Operations can claim it.' })
    Object.assign(actor, { id: member.id, role: 'STAKEHOLDER' })
    expect(await claimQueueRequest(id)).toEqual({})
    expect(await claimQueueRequest(id)).toMatchObject({ error: expect.stringMatching(/already claimed/) })
    expect(await claimQueueRequest('not-a-uuid')).toEqual({ error: 'Invalid request.' })
  })

  it('refuses a reassignment or move without a reason, and lets an admin do both with one', async () => {
    const id = await inGroup()
    await claimQueueRequest(id)
    Object.assign(actor, { id: admin.id, role: 'ADMIN' })
    expect(await reassignQueueRequest({ requestId: id, expectedAssigneeId: member.id, toUserId: member.id, reason: '' })).toMatchObject({ error: expect.stringMatching(/reason/i) })
    expect(await moveQueueRequest({ requestId: id, expectedGroupId: groupId, toGroupId: otherGroupId, reason: ' ' })).toMatchObject({ error: expect.stringMatching(/reason/i) })
    expect(await moveQueueRequest({ requestId: id, expectedGroupId: groupId, toGroupId: otherGroupId, reason: 'Belongs to Facilities' })).toEqual({})
    expect((await query('SELECT service_group_id, assignee_id FROM feature_requests WHERE id = $1', [id])).rows[0])
      .toEqual({ service_group_id: otherGroupId, assignee_id: null })
  })
})
