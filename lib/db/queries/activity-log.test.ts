import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import {
  logActivity,
  getActivityByRequest,
  getActivityByOrganization,
} from './activity-log'
import {
  hasDb,
  createTestOrg,
  createTestUser,
  createTestRequest,
  cleanupTestOrg,
  type TestOrg,
  type TestUser,
  type TestRequest,
} from '@/test/db-helpers'

describe.skipIf(!hasDb())('activity-log queries', () => {
  let org: TestOrg
  let alice: TestUser
  let bob: TestUser
  let request: TestRequest
  let userIds: string[]

  beforeAll(async () => {
    org = await createTestOrg('activity-test')
    alice = await createTestUser(org)
    bob = await createTestUser(org)
    userIds = [alice.id, bob.id]
  })

  afterAll(async () => {
    await cleanupTestOrg(org, userIds)
  })

  beforeEach(async () => {
    request = await createTestRequest(org, alice)
  })

  describe('logActivity', () => {
    it('should insert an activity row with required fields', async () => {
      const entry = await logActivity({
        organizationId: org.id,
        userId: alice.id,
        action: 'REQUEST_CREATED',
      })
      expect(entry.organizationId).toBe(org.id)
      expect(entry.userId).toBe(alice.id)
      expect(entry.action).toBe('REQUEST_CREATED')
      expect(entry.createdAt).toBeInstanceOf(Date)
    })

    it('should default optional fields to null and metadata to {}', async () => {
      const entry = await logActivity({
        organizationId: org.id,
        action: 'REQUEST_CREATED',
      })
      expect(entry.requestId).toBeNull()
      expect(entry.userId).toBeNull()
      expect(entry.entityType).toBeNull()
      expect(entry.entityId).toBeNull()
      expect(entry.metadata).toEqual({})
    })

    it('should persist metadata as JSONB', async () => {
      const entry = await logActivity({
        organizationId: org.id,
        userId: alice.id,
        action: 'STATUS_CHANGED',
        metadata: { from: 'DRAFT', to: 'UNDER_REVIEW' },
      })
      expect(entry.metadata).toEqual({ from: 'DRAFT', to: 'UNDER_REVIEW' })
    })

    it('should link to a request when requestId is provided', async () => {
      const entry = await logActivity({
        organizationId: org.id,
        requestId: request.id,
        userId: alice.id,
        action: 'COMMENT_ADDED',
      })
      expect(entry.requestId).toBe(request.id)
    })

    it('should accept entity_type and entity_id for polymorphic targets', async () => {
      const entry = await logActivity({
        organizationId: org.id,
        userId: alice.id,
        action: 'VOTE_CAST',
        entityType: 'VOTE',
        entityId: request.id,
      })
      expect(entry.entityType).toBe('VOTE')
      expect(entry.entityId).toBe(request.id)
    })
  })

  describe('getActivityByRequest', () => {
    it('should return only entries for the given request', async () => {
      const otherRequest = await createTestRequest(org, alice, 'Other')
      await logActivity({ organizationId: org.id, requestId: request.id, userId: alice.id, action: 'REQUEST_CREATED' })
      await logActivity({ organizationId: org.id, requestId: otherRequest.id, userId: alice.id, action: 'REQUEST_CREATED' })

      const entries = await getActivityByRequest(request.id)
      expect(entries).toHaveLength(1)
      expect(entries[0].requestId).toBe(request.id)
    })

    it('should return entries sorted newest first', async () => {
      await logActivity({ organizationId: org.id, requestId: request.id, userId: alice.id, action: 'REQUEST_CREATED' })
      await new Promise((r) => setTimeout(r, 10))
      await logActivity({ organizationId: org.id, requestId: request.id, userId: bob.id, action: 'COMMENT_ADDED' })

      const entries = await getActivityByRequest(request.id)
      expect(entries[0].action).toBe('COMMENT_ADDED')
      expect(entries[1].action).toBe('REQUEST_CREATED')
    })

    it('should include the actor user name via LEFT JOIN', async () => {
      await logActivity({ organizationId: org.id, requestId: request.id, userId: alice.id, action: 'REQUEST_CREATED' })
      const [entry] = await getActivityByRequest(request.id)
      expect(entry.userName).toMatch(/^User /)
    })

    it('should return null userName for system actions with no user', async () => {
      await logActivity({ organizationId: org.id, requestId: request.id, action: 'STATUS_CHANGED' })
      const [entry] = await getActivityByRequest(request.id)
      expect(entry.userName).toBeNull()
    })

    it('should honor limit and offset for pagination', async () => {
      for (let i = 0; i < 5; i++) {
        await logActivity({ organizationId: org.id, requestId: request.id, userId: alice.id, action: 'COMMENT_ADDED' })
      }
      const firstPage = await getActivityByRequest(request.id, 2, 0)
      const secondPage = await getActivityByRequest(request.id, 2, 2)
      expect(firstPage).toHaveLength(2)
      expect(secondPage).toHaveLength(2)
      expect(firstPage[0].id).not.toBe(secondPage[0].id)
    })

    it('should return an empty array when no activity exists', async () => {
      const entries = await getActivityByRequest(request.id)
      expect(entries).toEqual([])
    })
  })

  describe('getActivityByOrganization', () => {
    it('should return entries across all requests in the org', async () => {
      const otherRequest = await createTestRequest(org, alice, 'Other')
      await logActivity({ organizationId: org.id, requestId: request.id, userId: alice.id, action: 'REQUEST_CREATED' })
      await logActivity({ organizationId: org.id, requestId: otherRequest.id, userId: bob.id, action: 'REQUEST_CREATED' })

      const entries = await getActivityByOrganization(org.id)
      expect(entries.length).toBeGreaterThanOrEqual(2)
    })

    it('should isolate entries between organizations', async () => {
      const otherOrg = await createTestOrg('activity-isolation')
      const otherUser = await createTestUser(otherOrg)
      try {
        await logActivity({ organizationId: org.id, userId: alice.id, action: 'REQUEST_CREATED' })
        await logActivity({ organizationId: otherOrg.id, userId: otherUser.id, action: 'REQUEST_CREATED' })

        const ourEntries = await getActivityByOrganization(org.id)
        const theirEntries = await getActivityByOrganization(otherOrg.id)
        expect(ourEntries.every((e) => e.organizationId === org.id)).toBe(true)
        expect(theirEntries.every((e) => e.organizationId === otherOrg.id)).toBe(true)
      } finally {
        await cleanupTestOrg(otherOrg, [otherUser.id])
      }
    })

    it('should honor limit and offset', async () => {
      for (let i = 0; i < 4; i++) {
        await logActivity({ organizationId: org.id, userId: alice.id, action: 'COMMENT_ADDED' })
      }
      const page = await getActivityByOrganization(org.id, 2, 0)
      expect(page).toHaveLength(2)
    })
  })
})
