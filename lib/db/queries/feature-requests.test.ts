import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import {
  createFeatureRequest,
  getFeatureRequestById,
  listFeatureRequests,
} from './feature-requests'
import {
  hasDb,
  createTestOrg,
  createTestUser,
  cleanupTestOrg,
  type TestOrg,
  type TestUser,
} from '@/test/db-helpers'

describe.skipIf(!hasDb())('feature-requests queries', () => {
  let org: TestOrg
  let alice: TestUser
  let bob: TestUser
  let userIds: string[]

  beforeAll(async () => {
    org = await createTestOrg('fr-test')
    alice = await createTestUser(org, 'STAKEHOLDER')
    bob = await createTestUser(org, 'REVIEWER')
    userIds = [alice.id, bob.id]
  })

  afterAll(async () => {
    await cleanupTestOrg(org, userIds)
  })

  beforeEach(async () => {
    // Clear any feature_requests from previous tests in this org so list
    // assertions are deterministic. CASCADE on org would be heavier than
    // necessary between tests.
    const { query } = await import('@/lib/db/pool')
    await query(`DELETE FROM feature_requests WHERE organization_id = $1`, [org.id])
  })

  describe('createFeatureRequest', () => {
    it('should insert a request with sensible defaults', async () => {
      const req = await createFeatureRequest(org.id, alice.id, 'Add dark mode')
      expect(req.id).toBeTruthy()
      expect(req.organizationId).toBe(org.id)
      expect(req.requesterId).toBe(alice.id)
      expect(req.title).toBe('Add dark mode')
      expect(req.status).toBe('DRAFT')
      expect(req.intakeComplete).toBe(false)
      expect(req.tags).toEqual([])
      expect(req.qualityScore).toBeNull()
      expect(req.priorityScore).toBeNull()
      expect(req.createdAt).toBeInstanceOf(Date)
    })

    it('should generate a unique id per request', async () => {
      const a = await createFeatureRequest(org.id, alice.id, 'A')
      const b = await createFeatureRequest(org.id, alice.id, 'B')
      expect(a.id).not.toBe(b.id)
    })
  })

  describe('getFeatureRequestById', () => {
    it('should return the matching request', async () => {
      const created = await createFeatureRequest(org.id, alice.id, 'Lookup test')
      const fetched = await getFeatureRequestById(created.id)
      expect(fetched?.id).toBe(created.id)
      expect(fetched?.title).toBe('Lookup test')
    })

    it('should return null for a non-existent id', async () => {
      const fetched = await getFeatureRequestById('00000000-0000-0000-0000-000000000000')
      expect(fetched).toBeNull()
    })
  })

  describe('listFeatureRequests', () => {
    it('should return only requests for the given organization', async () => {
      const otherOrg = await createTestOrg('fr-isolation')
      const otherUser = await createTestUser(otherOrg)
      try {
        await createFeatureRequest(org.id, alice.id, 'Ours')
        await createFeatureRequest(otherOrg.id, otherUser.id, 'Theirs')

        const ours = await listFeatureRequests(org.id)
        expect(ours.requests.every((r) => r.organizationId === org.id)).toBe(true)
        expect(ours.requests.some((r) => r.title === 'Theirs')).toBe(false)
      } finally {
        await cleanupTestOrg(otherOrg, [otherUser.id])
      }
    })

    it('should sort newest first', async () => {
      await createFeatureRequest(org.id, alice.id, 'First')
      await new Promise((r) => setTimeout(r, 10))
      await createFeatureRequest(org.id, alice.id, 'Second')
      await new Promise((r) => setTimeout(r, 10))
      await createFeatureRequest(org.id, alice.id, 'Third')

      const { requests } = await listFeatureRequests(org.id)
      expect(requests[0].title).toBe('Third')
      expect(requests[2].title).toBe('First')
    })

    it('should return a count matching the filtered set', async () => {
      await createFeatureRequest(org.id, alice.id, 'A')
      await createFeatureRequest(org.id, alice.id, 'B')
      await createFeatureRequest(org.id, alice.id, 'C')
      const { total } = await listFeatureRequests(org.id)
      expect(total).toBe(3)
    })

    it('should filter by status', async () => {
      const a = await createFeatureRequest(org.id, alice.id, 'A')
      await createFeatureRequest(org.id, alice.id, 'B')
      const { query } = await import('@/lib/db/pool')
      await query(`UPDATE feature_requests SET status = 'UNDER_REVIEW' WHERE id = $1`, [a.id])

      const { requests, total } = await listFeatureRequests(org.id, { status: 'UNDER_REVIEW' })
      expect(total).toBe(1)
      expect(requests).toHaveLength(1)
      expect(requests[0].id).toBe(a.id)
    })

    it('should filter by requesterId', async () => {
      await createFeatureRequest(org.id, alice.id, 'Alice request')
      await createFeatureRequest(org.id, bob.id, 'Bob request')

      const { requests, total } = await listFeatureRequests(org.id, { requesterId: bob.id })
      expect(total).toBe(1)
      expect(requests[0].title).toBe('Bob request')
    })

    it('should honor limit and offset', async () => {
      for (const t of ['A', 'B', 'C', 'D', 'E']) {
        await createFeatureRequest(org.id, alice.id, t)
        await new Promise((r) => setTimeout(r, 5))
      }
      const first = await listFeatureRequests(org.id, { limit: 2, offset: 0 })
      const second = await listFeatureRequests(org.id, { limit: 2, offset: 2 })
      expect(first.requests).toHaveLength(2)
      expect(second.requests).toHaveLength(2)
      expect(first.total).toBe(5)
      expect(second.total).toBe(5)
      expect(first.requests[0].id).not.toBe(second.requests[0].id)
    })

    it('should return total=0 and empty array for an org with no requests', async () => {
      const emptyOrg = await createTestOrg('fr-empty')
      try {
        const result = await listFeatureRequests(emptyOrg.id)
        expect(result.total).toBe(0)
        expect(result.requests).toEqual([])
      } finally {
        await cleanupTestOrg(emptyOrg)
      }
    })
  })
})
