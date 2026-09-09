import { query } from '@/lib/db/pool';
import { mapRow, mapRows } from '@/lib/db/mappers';
import type { ReviewCycle, ReviewCycleTrigger } from '@/lib/types/database';

export async function insertReviewCycle(params: {
  organizationId: string;
  requeuedRequestIds: string[];
  triggeredBy: ReviewCycleTrigger;
  triggeredByUserId: string | null;
}): Promise<ReviewCycle> {
  const result = await query(
    `INSERT INTO review_cycles
       (organization_id, requeued_count, requeued_request_ids, triggered_by, triggered_by_user_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      params.organizationId,
      params.requeuedRequestIds.length,
      params.requeuedRequestIds,
      params.triggeredBy,
      params.triggeredByUserId,
    ]
  );
  return mapRow<ReviewCycle>(result.rows[0]);
}

/** Newest cycle for the org, or null if it has never run one. */
export async function getLatestReviewCycle(orgId: string): Promise<ReviewCycle | null> {
  const result = await query(
    `SELECT * FROM review_cycles
     WHERE organization_id = $1
     ORDER BY started_at DESC
     LIMIT 1`,
    [orgId]
  );
  if (result.rows.length === 0) return null;
  return mapRow<ReviewCycle>(result.rows[0]);
}

export async function listReviewCycles(orgId: string, limit = 10): Promise<ReviewCycle[]> {
  const result = await query(
    `SELECT * FROM review_cycles
     WHERE organization_id = $1
     ORDER BY started_at DESC
     LIMIT $2`,
    [orgId, limit]
  );
  return mapRows<ReviewCycle>(result.rows);
}

/**
 * How many of these requests are still sitting in UNDER_REVIEW.
 *
 * Deleted requests count as decided — they are not waiting on anyone.
 */
export async function countRequestsUnderReview(requestIds: string[]): Promise<number> {
  const result = await query(
    `SELECT COUNT(*)::int AS count FROM feature_requests
     WHERE id = ANY($1::uuid[]) AND status = 'UNDER_REVIEW' AND archived_at IS NULL`,
    [requestIds]
  );
  return result.rows[0].count;
}
