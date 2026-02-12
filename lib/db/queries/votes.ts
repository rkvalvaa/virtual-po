import { query } from '@/lib/db/pool';
import { mapRow, mapRows } from '@/lib/db/mappers';
import type { StakeholderVote, VoteSummary } from '@/lib/types/database';

export async function upsertVote(
  requestId: string,
  userId: string,
  voteValue: number,
  rationale: string | null
): Promise<StakeholderVote> {
  const result = await query(
    `INSERT INTO stakeholder_votes (request_id, user_id, vote_value, rationale)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (request_id, user_id)
     DO UPDATE SET vote_value = $3, rationale = $4, updated_at = NOW()
     RETURNING *`,
    [requestId, userId, voteValue, rationale]
  );
  return mapRow<StakeholderVote>(result.rows[0]);
}

export async function deleteVote(
  requestId: string,
  userId: string
): Promise<void> {
  await query(
    `DELETE FROM stakeholder_votes WHERE request_id = $1 AND user_id = $2`,
    [requestId, userId]
  );
}

export async function getVoteByUser(
  requestId: string,
  userId: string
): Promise<StakeholderVote | null> {
  const result = await query(
    `SELECT * FROM stakeholder_votes WHERE request_id = $1 AND user_id = $2`,
    [requestId, userId]
  );
  if (result.rows.length === 0) return null;
  return mapRow<StakeholderVote>(result.rows[0]);
}

export async function getVotesByRequest(
  requestId: string
): Promise<(StakeholderVote & { userName: string | null })[]> {
  const result = await query(
    `SELECT sv.*, u.name AS user_name
     FROM stakeholder_votes sv
     JOIN users u ON u.id = sv.user_id
     WHERE sv.request_id = $1
     ORDER BY sv.created_at DESC`,
    [requestId]
  );
  return mapRows<StakeholderVote & { userName: string | null }>(result.rows);
}

export async function getVoteSummary(
  requestId: string
): Promise<VoteSummary> {
  const result = await query(
    `SELECT
       $1::uuid AS request_id,
       COUNT(*)::int AS vote_count,
       COALESCE(AVG(vote_value), 0)::float AS average_score
     FROM stakeholder_votes
     WHERE request_id = $1`,
    [requestId]
  );
  return mapRow<VoteSummary>(result.rows[0]);
}

export async function getVoteSummariesByRequestIds(
  requestIds: string[]
): Promise<VoteSummary[]> {
  if (requestIds.length === 0) return [];
  const result = await query(
    `SELECT
       request_id,
       COUNT(*)::int AS vote_count,
       COALESCE(AVG(vote_value), 0)::float AS average_score
     FROM stakeholder_votes
     WHERE request_id = ANY($1)
     GROUP BY request_id`,
    [requestIds]
  );
  return mapRows<VoteSummary>(result.rows);
}
