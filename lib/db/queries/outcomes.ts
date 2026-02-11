import { query } from '@/lib/db/pool';
import { mapRow, mapRows } from '@/lib/db/mappers';
import type { Decision, DecisionOutcome, FeatureRequest, RequestSimilarity, Complexity } from '@/lib/types/database';

export async function recordDecisionOutcome(
  decisionId: string,
  outcome: DecisionOutcome,
  notes?: string
): Promise<Decision> {
  const result = await query(
    `UPDATE decisions
     SET outcome = $1,
         outcome_notes = $2,
         outcome_recorded_at = NOW()
     WHERE id = $3
     RETURNING *`,
    [outcome, notes ?? null, decisionId]
  );
  return mapRow<Decision>(result.rows[0]);
}

export async function recordActualComplexity(
  requestId: string,
  actualComplexity: Complexity,
  actualEffortDays?: number,
  lessonsLearned?: string
): Promise<FeatureRequest> {
  const result = await query(
    `UPDATE feature_requests
     SET actual_complexity = $1,
         actual_effort_days = $2,
         lessons_learned = $3,
         updated_at = NOW()
     WHERE id = $4
     RETURNING *`,
    [actualComplexity, actualEffortDays ?? null, lessonsLearned ?? null, requestId]
  );
  return mapRow<FeatureRequest>(result.rows[0]);
}

export interface CalibrationRow {
  id: string;
  title: string;
  predictedComplexity: Complexity | null;
  actualComplexity: Complexity | null;
  priorityScore: number | null;
  actualEffortDays: number | null;
  lessonsLearned: string | null;
}

export async function getCalibrationData(orgId: string): Promise<CalibrationRow[]> {
  const result = await query(
    `SELECT id, title, complexity AS predicted_complexity, actual_complexity,
            priority_score, actual_effort_days, lessons_learned
     FROM feature_requests
     WHERE organization_id = $1
       AND (actual_complexity IS NOT NULL OR actual_effort_days IS NOT NULL)
     ORDER BY updated_at DESC`,
    [orgId]
  );
  return mapRows<CalibrationRow>(result.rows);
}

export async function saveSimilarity(
  sourceId: string,
  similarId: string,
  score: number,
  matchReasons: string[]
): Promise<RequestSimilarity> {
  const result = await query(
    `INSERT INTO request_similarities (source_request_id, similar_request_id, similarity_score, match_reasons)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (source_request_id, similar_request_id)
     DO UPDATE SET similarity_score = EXCLUDED.similarity_score,
                   match_reasons = EXCLUDED.match_reasons,
                   created_at = NOW()
     RETURNING *`,
    [sourceId, similarId, score, JSON.stringify(matchReasons)]
  );
  return mapRow<RequestSimilarity>(result.rows[0]);
}

export interface SimilarRequestRow {
  similarityScore: number;
  matchReasons: string[];
  request: FeatureRequest;
}

export async function getSimilarRequests(
  requestId: string,
  limit = 10
): Promise<SimilarRequestRow[]> {
  const result = await query(
    `SELECT rs.similarity_score, rs.match_reasons,
            fr.id, fr.organization_id, fr.requester_id, fr.assignee_id,
            fr.title, fr.summary, fr.status, fr.intake_data, fr.intake_complete,
            fr.quality_score, fr.assessment_data, fr.business_score,
            fr.technical_score, fr.risk_score, fr.priority_score,
            fr.complexity, fr.tags, fr.external_id, fr.external_url,
            fr.actual_complexity, fr.actual_effort_days, fr.lessons_learned,
            fr.created_at, fr.updated_at
     FROM request_similarities rs
     JOIN feature_requests fr ON rs.similar_request_id = fr.id
     WHERE rs.source_request_id = $1
     ORDER BY rs.similarity_score DESC
     LIMIT $2`,
    [requestId, limit]
  );

  return result.rows.map((row) => ({
    similarityScore: parseFloat(row.similarity_score),
    matchReasons: row.match_reasons,
    request: mapRow<FeatureRequest>({
      id: row.id,
      organization_id: row.organization_id,
      requester_id: row.requester_id,
      assignee_id: row.assignee_id,
      title: row.title,
      summary: row.summary,
      status: row.status,
      intake_data: row.intake_data,
      intake_complete: row.intake_complete,
      quality_score: row.quality_score,
      assessment_data: row.assessment_data,
      business_score: row.business_score,
      technical_score: row.technical_score,
      risk_score: row.risk_score,
      priority_score: row.priority_score,
      complexity: row.complexity,
      tags: row.tags,
      external_id: row.external_id,
      external_url: row.external_url,
      actual_complexity: row.actual_complexity,
      actual_effort_days: row.actual_effort_days,
      lessons_learned: row.lessons_learned,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }),
  }));
}

export interface KeywordMatchRow {
  id: string;
  title: string;
  summary: string | null;
  status: string;
  complexity: string | null;
  priorityScore: number | null;
  relevanceScore: number;
}

export async function findSimilarByKeywords(
  orgId: string,
  keywords: string[],
  excludeRequestId?: string,
  limit = 10
): Promise<KeywordMatchRow[]> {
  const conditions: string[] = ['fr.organization_id = $1'];
  const values: unknown[] = [orgId];
  let paramIndex = 2;

  if (excludeRequestId) {
    conditions.push(`fr.id != $${paramIndex++}`);
    values.push(excludeRequestId);
  }

  const keywordConditions: string[] = [];
  for (const keyword of keywords) {
    keywordConditions.push(
      `(fr.title ILIKE $${paramIndex} OR fr.summary ILIKE $${paramIndex})`
    );
    values.push(`%${keyword}%`);
    paramIndex++;
  }

  if (keywordConditions.length > 0) {
    conditions.push(`(${keywordConditions.join(' OR ')})`);
  }

  // Build a relevance score by counting how many keywords match
  const scoreParts: string[] = [];
  let scoreParamIndex = paramIndex;
  for (const keyword of keywords) {
    scoreParts.push(
      `CASE WHEN fr.title ILIKE $${scoreParamIndex} OR fr.summary ILIKE $${scoreParamIndex} THEN 1 ELSE 0 END`
    );
    values.push(`%${keyword}%`);
    scoreParamIndex++;
  }

  const relevanceExpr = scoreParts.length > 0
    ? scoreParts.join(' + ')
    : '0';

  values.push(limit);

  const result = await query(
    `SELECT fr.id, fr.title, fr.summary, fr.status, fr.complexity, fr.priority_score,
            (${relevanceExpr}) AS relevance_score
     FROM feature_requests fr
     WHERE ${conditions.join(' AND ')}
     ORDER BY relevance_score DESC, fr.created_at DESC
     LIMIT $${scoreParamIndex}`,
    values
  );

  return result.rows.map((row) => ({
    id: row.id,
    title: row.title,
    summary: row.summary,
    status: row.status,
    complexity: row.complexity,
    priorityScore: row.priority_score != null ? parseFloat(row.priority_score) : null,
    relevanceScore: parseInt(row.relevance_score, 10),
  }));
}
