import { query } from '@/lib/db/pool';
import { mapRow, mapRows } from '@/lib/db/mappers';
import type { Decision, DecisionType } from '@/lib/types/database';

export async function createDecision(
  requestId: string,
  userId: string,
  decision: DecisionType,
  rationale: string
): Promise<Decision> {
  const result = await query(
    `INSERT INTO decisions (request_id, user_id, decision, rationale)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [requestId, userId, decision, rationale]
  );
  return mapRow<Decision>(result.rows[0]);
}

export async function getDecisionsByRequestId(
  requestId: string
): Promise<Decision[]> {
  const result = await query(
    `SELECT * FROM decisions
     WHERE request_id = $1
     ORDER BY created_at DESC`,
    [requestId]
  );
  return mapRows<Decision>(result.rows);
}
