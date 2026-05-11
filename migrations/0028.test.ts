import { describe, it, expect } from 'vitest'
import { hasDb } from '@/test/db-helpers'

describe.skipIf(!hasDb())('migration 0028 — missing indexes', () => {
  it('should create all six indexes', async () => {
    const { query } = await import('@/lib/db/pool')
    const result = await query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname = 'public'
         AND indexname IN (
           'idx_comments_request',
           'idx_decisions_request',
           'idx_attachments_request',
           'idx_feature_requests_org_status',
           'idx_feature_requests_org_created',
           'idx_feature_requests_org_requester'
         )`,
      [],
    )
    const names = result.rows.map((r) => r.indexname).sort()
    expect(names).toEqual([
      'idx_attachments_request',
      'idx_comments_request',
      'idx_decisions_request',
      'idx_feature_requests_org_created',
      'idx_feature_requests_org_requester',
      'idx_feature_requests_org_status',
    ])
  })
})
