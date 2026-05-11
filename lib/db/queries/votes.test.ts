import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import {
  upsertVote,
  deleteVote,
  getVoteByUser,
  getVotesByRequest,
  getVoteSummary,
  getVoteSummariesByRequestIds,
} from './votes'
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

describe.skipIf(!hasDb())('votes queries', () => {
  let org: TestOrg
  let alice: TestUser
  let bob: TestUser
  let carol: TestUser
  let request: TestRequest
  let userIds: string[]

  beforeAll(async () => {
    org = await createTestOrg('votes-test')
    alice = await createTestUser(org)
    bob = await createTestUser(org)
    carol = await createTestUser(org)
    userIds = [alice.id, bob.id, carol.id]
  })

  afterAll(async () => {
    await cleanupTestOrg(org, userIds)
  })

  beforeEach(async () => {
    request = await createTestRequest(org, alice, 'Vote test request')
  })

  describe('upsertVote', () => {
    it('should create a vote when none exists', async () => {
      const vote = await upsertVote(request.id, alice.id, 4, 'Looks great')
      expect(vote.requestId).toBe(request.id)
      expect(vote.userId).toBe(alice.id)
      expect(vote.voteValue).toBe(4)
      expect(vote.rationale).toBe('Looks great')
      expect(vote.createdAt).toBeInstanceOf(Date)
      expect(vote.updatedAt).toBeInstanceOf(Date)
    })

    it('should accept null rationale', async () => {
      const vote = await upsertVote(request.id, alice.id, 3, null)
      expect(vote.rationale).toBeNull()
    })

    it('should update an existing vote rather than insert a duplicate', async () => {
      const first = await upsertVote(request.id, alice.id, 2, 'Initial')
      const second = await upsertVote(request.id, alice.id, 5, 'Changed my mind')
      expect(second.id).toBe(first.id)
      expect(second.voteValue).toBe(5)
      expect(second.rationale).toBe('Changed my mind')
    })

    it('should reject vote values outside 1-5 (DB CHECK constraint)', async () => {
      await expect(upsertVote(request.id, alice.id, 6, null)).rejects.toThrow()
      await expect(upsertVote(request.id, alice.id, 0, null)).rejects.toThrow()
    })

    it('should allow distinct users to vote on the same request', async () => {
      await upsertVote(request.id, alice.id, 3, null)
      await upsertVote(request.id, bob.id, 5, null)
      const votes = await getVotesByRequest(request.id)
      expect(votes).toHaveLength(2)
    })
  })

  describe('deleteVote', () => {
    it('should remove an existing vote', async () => {
      await upsertVote(request.id, alice.id, 4, null)
      await deleteVote(request.id, alice.id)
      const vote = await getVoteByUser(request.id, alice.id)
      expect(vote).toBeNull()
    })

    it('should not error when deleting a vote that does not exist', async () => {
      await expect(deleteVote(request.id, alice.id)).resolves.toBeUndefined()
    })

    it('should only delete the matching user’s vote', async () => {
      await upsertVote(request.id, alice.id, 4, null)
      await upsertVote(request.id, bob.id, 5, null)
      await deleteVote(request.id, alice.id)
      expect(await getVoteByUser(request.id, alice.id)).toBeNull()
      expect(await getVoteByUser(request.id, bob.id)).not.toBeNull()
    })
  })

  describe('getVoteByUser', () => {
    it('should return null when no vote exists', async () => {
      const vote = await getVoteByUser(request.id, alice.id)
      expect(vote).toBeNull()
    })

    it('should return the user’s vote when one exists', async () => {
      await upsertVote(request.id, alice.id, 4, 'note')
      const vote = await getVoteByUser(request.id, alice.id)
      expect(vote?.voteValue).toBe(4)
      expect(vote?.rationale).toBe('note')
    })
  })

  describe('getVotesByRequest', () => {
    it('should return all votes for a request', async () => {
      await upsertVote(request.id, alice.id, 3, null)
      await upsertVote(request.id, bob.id, 5, null)
      await upsertVote(request.id, carol.id, 1, null)
      const votes = await getVotesByRequest(request.id)
      expect(votes).toHaveLength(3)
    })

    it('should include the voter’s name via join', async () => {
      await upsertVote(request.id, alice.id, 4, null)
      const votes = await getVotesByRequest(request.id)
      expect(votes[0].userName).toMatch(/^User /)
    })

    it('should return votes sorted newest first', async () => {
      await upsertVote(request.id, alice.id, 3, null)
      await new Promise((r) => setTimeout(r, 10))
      await upsertVote(request.id, bob.id, 4, null)
      await new Promise((r) => setTimeout(r, 10))
      await upsertVote(request.id, carol.id, 5, null)
      const votes = await getVotesByRequest(request.id)
      expect(votes[0].userId).toBe(carol.id)
      expect(votes[2].userId).toBe(alice.id)
    })

    it('should return an empty array when there are no votes', async () => {
      const votes = await getVotesByRequest(request.id)
      expect(votes).toEqual([])
    })
  })

  describe('getVoteSummary', () => {
    it('should return zero count and zero average when no votes exist', async () => {
      const summary = await getVoteSummary(request.id)
      expect(summary.voteCount).toBe(0)
      expect(summary.averageScore).toBe(0)
    })

    it('should compute the average of all votes for a request', async () => {
      await upsertVote(request.id, alice.id, 2, null)
      await upsertVote(request.id, bob.id, 4, null)
      await upsertVote(request.id, carol.id, 3, null)
      const summary = await getVoteSummary(request.id)
      expect(summary.voteCount).toBe(3)
      expect(summary.averageScore).toBe(3)
    })
  })

  describe('getVoteSummariesByRequestIds', () => {
    it('should return an empty array for empty input without querying', async () => {
      const summaries = await getVoteSummariesByRequestIds([])
      expect(summaries).toEqual([])
    })

    it('should return one summary row per request with votes', async () => {
      const requestB = await createTestRequest(org, alice, 'Second request')
      await upsertVote(request.id, alice.id, 5, null)
      await upsertVote(requestB.id, bob.id, 3, null)
      await upsertVote(requestB.id, carol.id, 1, null)

      const summaries = await getVoteSummariesByRequestIds([request.id, requestB.id])
      expect(summaries).toHaveLength(2)

      const byId = new Map(summaries.map((s) => [s.requestId, s]))
      expect(byId.get(request.id)?.voteCount).toBe(1)
      expect(byId.get(request.id)?.averageScore).toBe(5)
      expect(byId.get(requestB.id)?.voteCount).toBe(2)
      expect(byId.get(requestB.id)?.averageScore).toBe(2)
    })

    it('should skip requests with no votes (GROUP BY excludes empty groups)', async () => {
      const requestB = await createTestRequest(org, alice, 'No votes')
      await upsertVote(request.id, alice.id, 4, null)
      const summaries = await getVoteSummariesByRequestIds([request.id, requestB.id])
      expect(summaries).toHaveLength(1)
      expect(summaries[0].requestId).toBe(request.id)
    })
  })
})
