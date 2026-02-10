import { query } from '@/lib/db/pool';
import { mapRow, mapRows } from '@/lib/db/mappers';
import type {
  FeatureRequest,
  RequestStatus,
  Complexity,
} from '@/lib/types/database';

export async function createFeatureRequest(
  orgId: string,
  requesterId: string,
  title: string
): Promise<FeatureRequest> {
  const result = await query(
    `INSERT INTO feature_requests (organization_id, requester_id, title)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [orgId, requesterId, title]
  );
  return mapRow<FeatureRequest>(result.rows[0]);
}

export async function getFeatureRequestById(id: string): Promise<FeatureRequest | null> {
  const result = await query(
    `SELECT * FROM feature_requests WHERE id = $1`,
    [id]
  );
  if (result.rows.length === 0) return null;
  return mapRow<FeatureRequest>(result.rows[0]);
}

export async function listFeatureRequests(
  orgId: string,
  filters?: {
    status?: RequestStatus;
    requesterId?: string;
    assigneeId?: string;
    limit?: number;
    offset?: number;
  }
): Promise<{ requests: FeatureRequest[]; total: number }> {
  const conditions: string[] = ['organization_id = $1'];
  const values: unknown[] = [orgId];
  let paramIndex = 2;

  if (filters?.status) {
    conditions.push(`status = $${paramIndex++}`);
    values.push(filters.status);
  }
  if (filters?.requesterId) {
    conditions.push(`requester_id = $${paramIndex++}`);
    values.push(filters.requesterId);
  }
  if (filters?.assigneeId) {
    conditions.push(`assignee_id = $${paramIndex++}`);
    values.push(filters.assigneeId);
  }

  const whereClause = conditions.join(' AND ');

  const countResult = await query(
    `SELECT COUNT(*) AS total FROM feature_requests WHERE ${whereClause}`,
    values
  );
  const total = parseInt(countResult.rows[0].total, 10);

  const limit = filters?.limit ?? 50;
  const offset = filters?.offset ?? 0;

  const dataResult = await query(
    `SELECT * FROM feature_requests
     WHERE ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    [...values, limit, offset]
  );

  return {
    requests: mapRows<FeatureRequest>(dataResult.rows),
    total,
  };
}

export async function updateFeatureRequest(
  id: string,
  data: Partial<FeatureRequest>
): Promise<FeatureRequest> {
  const fieldMap: Record<string, string> = {
    title: 'title',
    summary: 'summary',
    status: 'status',
    assigneeId: 'assignee_id',
    intakeData: 'intake_data',
    intakeComplete: 'intake_complete',
    qualityScore: 'quality_score',
    assessmentData: 'assessment_data',
    businessScore: 'business_score',
    technicalScore: 'technical_score',
    riskScore: 'risk_score',
    priorityScore: 'priority_score',
    complexity: 'complexity',
    tags: 'tags',
    externalId: 'external_id',
    externalUrl: 'external_url',
  };

  const fields: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  for (const [key, column] of Object.entries(fieldMap)) {
    if (key in data) {
      const value = (data as Record<string, unknown>)[key];
      fields.push(`${column} = $${paramIndex++}`);
      if (column === 'intake_data' || column === 'assessment_data') {
        values.push(JSON.stringify(value));
      } else {
        values.push(value);
      }
    }
  }

  if (fields.length === 0) {
    const existing = await getFeatureRequestById(id);
    if (!existing) throw new Error(`Feature request ${id} not found`);
    return existing;
  }

  fields.push(`updated_at = NOW()`);
  values.push(id);

  const result = await query(
    `UPDATE feature_requests SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );
  return mapRow<FeatureRequest>(result.rows[0]);
}

export async function updateFeatureRequestStatus(
  id: string,
  status: RequestStatus
): Promise<FeatureRequest> {
  const result = await query(
    `UPDATE feature_requests SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
    [status, id]
  );
  return mapRow<FeatureRequest>(result.rows[0]);
}

export async function updateIntakeData(
  id: string,
  intakeData: Record<string, unknown>,
  qualityScore?: number
): Promise<FeatureRequest> {
  const result = await query(
    `UPDATE feature_requests
     SET intake_data = $1,
         quality_score = COALESCE($2, quality_score),
         updated_at = NOW()
     WHERE id = $3
     RETURNING *`,
    [JSON.stringify(intakeData), qualityScore ?? null, id]
  );
  return mapRow<FeatureRequest>(result.rows[0]);
}

export async function updateAssessmentData(
  id: string,
  assessmentData: Record<string, unknown>,
  scores: {
    businessScore?: number;
    technicalScore?: number;
    riskScore?: number;
    priorityScore?: number;
    complexity?: Complexity;
  }
): Promise<FeatureRequest> {
  const result = await query(
    `UPDATE feature_requests
     SET assessment_data = $1,
         business_score = COALESCE($2, business_score),
         technical_score = COALESCE($3, technical_score),
         risk_score = COALESCE($4, risk_score),
         priority_score = COALESCE($5, priority_score),
         complexity = COALESCE($6, complexity),
         updated_at = NOW()
     WHERE id = $7
     RETURNING *`,
    [
      JSON.stringify(assessmentData),
      scores.businessScore ?? null,
      scores.technicalScore ?? null,
      scores.riskScore ?? null,
      scores.priorityScore ?? null,
      scores.complexity ?? null,
      id,
    ]
  );
  return mapRow<FeatureRequest>(result.rows[0]);
}
