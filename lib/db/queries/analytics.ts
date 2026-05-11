import { query } from '@/lib/db/pool';

export interface DateRange {
  from: string;
  to: string;
}

export interface DashboardSummary {
  totalRequests: number;
  pendingReview: number;
  inBacklog: number;
  completed: number;
  avgQualityScore: number | null;
}

export interface StatusDistributionRow {
  status: string;
  count: number;
}

export interface RequestVolumeRow {
  month: string;
  count: number;
}

export interface PriorityDistributionRow {
  band: string;
  count: number;
}

export interface AverageTimeToDecision {
  avgDays: number | null;
}

export interface TopRequesterRow {
  userId: string;
  name: string;
  count: number;
}

export async function getDashboardSummary(
  orgId: string,
  dateRange?: DateRange
): Promise<DashboardSummary> {
  const params: unknown[] = [orgId];
  let dateFilter = '';
  if (dateRange) {
    dateFilter = ` AND created_at >= $2 AND created_at <= $3`;
    params.push(dateRange.from, dateRange.to);
  }

  const result = await query(
    `SELECT
       COUNT(*) AS total_requests,
       COUNT(*) FILTER (WHERE status IN ('UNDER_REVIEW', 'NEEDS_INFO')) AS pending_review,
       COUNT(*) FILTER (WHERE status IN ('APPROVED', 'IN_BACKLOG', 'IN_PROGRESS')) AS in_backlog,
       COUNT(*) FILTER (WHERE status = 'COMPLETED') AS completed,
       ROUND(AVG(quality_score) FILTER (WHERE quality_score IS NOT NULL)) AS avg_quality_score
     FROM feature_requests
     WHERE organization_id = $1${dateFilter}`,
    params
  );

  const row = result.rows[0];
  return {
    totalRequests: parseInt(row.total_requests, 10),
    pendingReview: parseInt(row.pending_review, 10),
    inBacklog: parseInt(row.in_backlog, 10),
    completed: parseInt(row.completed, 10),
    avgQualityScore: row.avg_quality_score != null ? parseFloat(row.avg_quality_score) : null,
  };
}

export async function getStatusDistribution(
  orgId: string,
  dateRange?: DateRange
): Promise<StatusDistributionRow[]> {
  const params: unknown[] = [orgId];
  let dateFilter = '';
  if (dateRange) {
    dateFilter = ` AND created_at >= $2 AND created_at <= $3`;
    params.push(dateRange.from, dateRange.to);
  }

  const result = await query(
    `SELECT status, COUNT(*) AS count
     FROM feature_requests
     WHERE organization_id = $1${dateFilter}
     GROUP BY status
     ORDER BY count DESC`,
    params
  );

  return result.rows.map((row) => ({
    status: row.status,
    count: parseInt(row.count, 10),
  }));
}

export async function getRequestVolumeByMonth(
  orgId: string,
  dateRange?: DateRange
): Promise<RequestVolumeRow[]> {
  const params: unknown[] = [orgId];
  let dateFilter = ' AND created_at >= NOW() - INTERVAL \'12 months\'';
  if (dateRange) {
    dateFilter = ` AND created_at >= $2 AND created_at <= $3`;
    params.push(dateRange.from, dateRange.to);
  }

  const result = await query(
    `SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month,
            COUNT(*) AS count
     FROM feature_requests
     WHERE organization_id = $1${dateFilter}
     GROUP BY DATE_TRUNC('month', created_at)
     ORDER BY month ASC`,
    params
  );

  return result.rows.map((row) => ({
    month: row.month,
    count: parseInt(row.count, 10),
  }));
}

export async function getPriorityDistribution(
  orgId: string,
  dateRange?: DateRange
): Promise<PriorityDistributionRow[]> {
  const params: unknown[] = [orgId];
  let dateFilter = '';
  if (dateRange) {
    dateFilter = ` AND created_at >= $2 AND created_at <= $3`;
    params.push(dateRange.from, dateRange.to);
  }

  // ORDER BY wraps a subquery because Postgres does not allow referencing
  // a SELECT alias inside a CASE expression in the outer ORDER BY (it looks
  // up `band` as a column on feature_requests, not the alias).
  const result = await query(
    `SELECT band, count FROM (
       SELECT
         CASE
           WHEN priority_score >= 75 THEN 'High'
           WHEN priority_score >= 50 THEN 'Medium'
           WHEN priority_score IS NOT NULL THEN 'Low'
           ELSE 'Unscored'
         END AS band,
         COUNT(*) AS count
       FROM feature_requests
       WHERE organization_id = $1${dateFilter}
       GROUP BY 1
     ) bands
     ORDER BY
       CASE band WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 WHEN 'Low' THEN 3 ELSE 4 END`,
    params
  );

  return result.rows.map((row) => ({
    band: row.band,
    count: parseInt(row.count, 10),
  }));
}

export async function getAverageTimeToDecision(
  orgId: string,
  dateRange?: DateRange
): Promise<AverageTimeToDecision> {
  const params: unknown[] = [orgId];
  let dateFilter = '';
  if (dateRange) {
    dateFilter = ` AND d.created_at >= $2 AND d.created_at <= $3`;
    params.push(dateRange.from, dateRange.to);
  }

  const result = await query(
    `SELECT ROUND(AVG(EXTRACT(EPOCH FROM (d.created_at - fr.created_at)) / 86400)::numeric, 1) AS avg_days
     FROM decisions d
     JOIN feature_requests fr ON d.request_id = fr.id
     WHERE fr.organization_id = $1${dateFilter}`,
    params
  );

  const row = result.rows[0];
  return {
    avgDays: row.avg_days != null ? parseFloat(row.avg_days) : null,
  };
}

export async function getTopRequesters(
  orgId: string,
  limit = 5,
  dateRange?: DateRange
): Promise<TopRequesterRow[]> {
  const params: unknown[] = [orgId, limit];
  let dateFilter = '';
  if (dateRange) {
    dateFilter = ` AND fr.created_at >= $3 AND fr.created_at <= $4`;
    params.push(dateRange.from, dateRange.to);
  }

  const result = await query(
    `SELECT u.id AS user_id, u.name, COUNT(*) AS count
     FROM feature_requests fr
     JOIN users u ON fr.requester_id = u.id
     WHERE fr.organization_id = $1${dateFilter}
     GROUP BY u.id, u.name
     ORDER BY count DESC
     LIMIT $2`,
    params
  );

  return result.rows.map((row) => ({
    userId: row.user_id,
    name: row.name,
    count: parseInt(row.count, 10),
  }));
}

// --- Advanced Analytics ---

export interface EstimateAccuracyRow {
  complexity: string;
  predictedCount: number;
  matchedCount: number;
  accuracyPercent: number;
}

export interface EstimateAccuracySummary {
  totalCompared: number;
  matchCount: number;
  accuracyPercent: number;
  byComplexity: EstimateAccuracyRow[];
}

export async function getEstimateAccuracySummary(
  orgId: string,
  dateRange?: DateRange
): Promise<EstimateAccuracySummary> {
  const params: unknown[] = [orgId];
  let dateFilter = '';
  if (dateRange) {
    dateFilter = ` AND created_at >= $2 AND created_at <= $3`;
    params.push(dateRange.from, dateRange.to);
  }

  const result = await query(
    `SELECT
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE complexity = actual_complexity) AS matched,
       complexity,
       COUNT(*) FILTER (WHERE complexity = actual_complexity) AS complexity_matched
     FROM feature_requests
     WHERE complexity IS NOT NULL
       AND actual_complexity IS NOT NULL
       AND organization_id = $1${dateFilter}
     GROUP BY complexity`,
    params
  );

  let totalCompared = 0;
  let matchCount = 0;
  const byComplexity: EstimateAccuracyRow[] = result.rows.map((row) => {
    const predicted = parseInt(row.total, 10);
    const matched = parseInt(row.complexity_matched, 10);
    totalCompared += predicted;
    matchCount += matched;
    return {
      complexity: row.complexity,
      predictedCount: predicted,
      matchedCount: matched,
      accuracyPercent: predicted > 0 ? Math.round((matched / predicted) * 100) : 0,
    };
  });

  return {
    totalCompared,
    matchCount,
    accuracyPercent: totalCompared > 0 ? Math.round((matchCount / totalCompared) * 100) : 0,
    byComplexity,
  };
}

export interface StakeholderEngagementRow {
  userId: string;
  name: string;
  requestCount: number;
  commentCount: number;
  voteCount: number;
  avgQualityScore: number | null;
  lastActivityAt: string | null;
}

export async function getStakeholderEngagement(
  orgId: string,
  limit = 10,
  dateRange?: DateRange
): Promise<StakeholderEngagementRow[]> {
  const params: unknown[] = [orgId, limit];
  let dateFilter = '';
  if (dateRange) {
    dateFilter = ` AND fr.created_at >= $3 AND fr.created_at <= $4`;
    params.push(dateRange.from, dateRange.to);
  }

  const result = await query(
    `SELECT
       u.id AS user_id,
       u.name,
       COUNT(DISTINCT fr.id) AS request_count,
       COUNT(DISTINCT c.id) AS comment_count,
       COUNT(DISTINCT sv.id) AS vote_count,
       ROUND(AVG(fr.quality_score)::numeric, 1) AS avg_quality_score,
       GREATEST(MAX(fr.created_at), MAX(c.created_at), MAX(sv.created_at)) AS last_activity_at
     FROM users u
     JOIN feature_requests fr ON fr.requester_id = u.id AND fr.organization_id = $1
     LEFT JOIN comments c ON c.author_id = u.id
     LEFT JOIN stakeholder_votes sv ON sv.user_id = u.id
     WHERE 1=1${dateFilter}
     GROUP BY u.id, u.name
     ORDER BY (COUNT(DISTINCT fr.id) + COUNT(DISTINCT c.id) + COUNT(DISTINCT sv.id)) DESC
     LIMIT $2`,
    params
  );

  return result.rows.map((row) => ({
    userId: row.user_id,
    name: row.name,
    requestCount: parseInt(row.request_count, 10),
    commentCount: parseInt(row.comment_count, 10),
    voteCount: parseInt(row.vote_count, 10),
    avgQualityScore: row.avg_quality_score != null ? parseFloat(row.avg_quality_score) : null,
    lastActivityAt: row.last_activity_at != null ? String(row.last_activity_at) : null,
  }));
}

export interface TimeToDecisionTrendRow {
  month: string;
  avgDays: number;
  decisionCount: number;
}

export async function getTimeToDecisionTrend(
  orgId: string,
  dateRange?: DateRange
): Promise<TimeToDecisionTrendRow[]> {
  const params: unknown[] = [orgId];
  let dateFilter = ' AND d.created_at >= NOW() - INTERVAL \'12 months\'';
  if (dateRange) {
    dateFilter = ` AND d.created_at >= $2 AND d.created_at <= $3`;
    params.push(dateRange.from, dateRange.to);
  }

  const result = await query(
    `SELECT
       TO_CHAR(DATE_TRUNC('month', d.created_at), 'YYYY-MM') AS month,
       ROUND(AVG(EXTRACT(EPOCH FROM (d.created_at - fr.created_at)) / 86400)::numeric, 1) AS avg_days,
       COUNT(*) AS decision_count
     FROM decisions d
     JOIN feature_requests fr ON d.request_id = fr.id
     WHERE fr.organization_id = $1${dateFilter}
     GROUP BY DATE_TRUNC('month', d.created_at)
     ORDER BY month ASC`,
    params
  );

  return result.rows.map((row) => ({
    month: row.month,
    avgDays: parseFloat(row.avg_days),
    decisionCount: parseInt(row.decision_count, 10),
  }));
}

export interface ConfidenceTrendRow {
  month: string;
  avgBusinessScore: number;
  avgTechnicalScore: number;
  avgRiskScore: number;
  assessmentCount: number;
}

export async function getConfidenceTrend(
  orgId: string,
  dateRange?: DateRange
): Promise<ConfidenceTrendRow[]> {
  const params: unknown[] = [orgId];
  let dateFilter = ' AND updated_at >= NOW() - INTERVAL \'12 months\'';
  if (dateRange) {
    dateFilter = ` AND updated_at >= $2 AND updated_at <= $3`;
    params.push(dateRange.from, dateRange.to);
  }

  const result = await query(
    `SELECT
       TO_CHAR(DATE_TRUNC('month', updated_at), 'YYYY-MM') AS month,
       ROUND(AVG(business_score)::numeric, 1) AS avg_business_score,
       ROUND(AVG(technical_score)::numeric, 1) AS avg_technical_score,
       ROUND(AVG(risk_score)::numeric, 1) AS avg_risk_score,
       COUNT(*) AS assessment_count
     FROM feature_requests
     WHERE assessment_data IS NOT NULL
       AND organization_id = $1${dateFilter}
     GROUP BY DATE_TRUNC('month', updated_at)
     ORDER BY month ASC`,
    params
  );

  return result.rows.map((row) => ({
    month: row.month,
    avgBusinessScore: parseFloat(row.avg_business_score),
    avgTechnicalScore: parseFloat(row.avg_technical_score),
    avgRiskScore: parseFloat(row.avg_risk_score),
    assessmentCount: parseInt(row.assessment_count, 10),
  }));
}

// --- Vote Analytics ---

export interface TopVotedRequestRow {
  requestId: string;
  title: string;
  voteCount: number;
  averageScore: number;
  status: string;
}

export async function getTopVotedRequests(
  orgId: string,
  limit = 10,
  dateRange?: DateRange
): Promise<TopVotedRequestRow[]> {
  const params: unknown[] = [orgId, limit];
  let dateFilter = '';
  if (dateRange) {
    dateFilter = ` AND sv.created_at >= $3 AND sv.created_at <= $4`;
    params.push(dateRange.from, dateRange.to);
  }

  const result = await query(
    `SELECT
       fr.id AS request_id,
       fr.title,
       COUNT(sv.id)::int AS vote_count,
       ROUND(AVG(sv.vote_value)::numeric, 1)::float AS average_score,
       fr.status
     FROM feature_requests fr
     JOIN stakeholder_votes sv ON sv.request_id = fr.id
     WHERE fr.organization_id = $1${dateFilter}
     GROUP BY fr.id, fr.title, fr.status
     ORDER BY average_score DESC, vote_count DESC
     LIMIT $2`,
    params
  );

  return result.rows.map((row) => ({
    requestId: row.request_id,
    title: row.title,
    voteCount: row.vote_count,
    averageScore: parseFloat(row.average_score),
    status: row.status,
  }));
}

export interface VoteTrendRow {
  month: string;
  voteCount: number;
  avgScore: number;
  uniqueVoters: number;
}

export async function getVoteTrend(
  orgId: string,
  dateRange?: DateRange
): Promise<VoteTrendRow[]> {
  const params: unknown[] = [orgId];
  let dateFilter = ' AND sv.created_at >= NOW() - INTERVAL \'12 months\'';
  if (dateRange) {
    dateFilter = ` AND sv.created_at >= $2 AND sv.created_at <= $3`;
    params.push(dateRange.from, dateRange.to);
  }

  const result = await query(
    `SELECT
       TO_CHAR(DATE_TRUNC('month', sv.created_at), 'YYYY-MM') AS month,
       COUNT(*)::int AS vote_count,
       ROUND(AVG(sv.vote_value)::numeric, 1)::float AS avg_score,
       COUNT(DISTINCT sv.user_id)::int AS unique_voters
     FROM stakeholder_votes sv
     JOIN feature_requests fr ON sv.request_id = fr.id
     WHERE fr.organization_id = $1${dateFilter}
     GROUP BY DATE_TRUNC('month', sv.created_at)
     ORDER BY month ASC`,
    params
  );

  return result.rows.map((row) => ({
    month: row.month,
    voteCount: row.vote_count,
    avgScore: parseFloat(row.avg_score),
    uniqueVoters: row.unique_voters,
  }));
}

export interface VoteSummaryStats {
  totalVotes: number;
  uniqueVoters: number;
  avgScore: number;
  votedRequestsCount: number;
  totalRequestsCount: number;
}

export async function getVoteSummaryStats(
  orgId: string,
  dateRange?: DateRange
): Promise<VoteSummaryStats> {
  const params: unknown[] = [orgId];
  let svDateFilter = '';
  let plainDateFilter = '';
  if (dateRange) {
    svDateFilter = ` AND sv.created_at >= $2 AND sv.created_at <= $3`;
    plainDateFilter = ` AND created_at >= $2 AND created_at <= $3`;
    params.push(dateRange.from, dateRange.to);
  }

  const result = await query(
    `SELECT
       (SELECT COUNT(*)::int FROM stakeholder_votes sv JOIN feature_requests fr ON sv.request_id = fr.id WHERE fr.organization_id = $1${svDateFilter}) AS total_votes,
       (SELECT COUNT(DISTINCT sv.user_id)::int FROM stakeholder_votes sv JOIN feature_requests fr ON sv.request_id = fr.id WHERE fr.organization_id = $1${svDateFilter}) AS unique_voters,
       (SELECT COALESCE(ROUND(AVG(sv.vote_value)::numeric, 1), 0)::float FROM stakeholder_votes sv JOIN feature_requests fr ON sv.request_id = fr.id WHERE fr.organization_id = $1${svDateFilter}) AS avg_score,
       (SELECT COUNT(DISTINCT sv.request_id)::int FROM stakeholder_votes sv JOIN feature_requests fr ON sv.request_id = fr.id WHERE fr.organization_id = $1${svDateFilter}) AS voted_requests_count,
       (SELECT COUNT(*)::int FROM feature_requests WHERE organization_id = $1${plainDateFilter}) AS total_requests_count`,
    params
  );

  const row = result.rows[0];
  return {
    totalVotes: row.total_votes,
    uniqueVoters: row.unique_voters,
    avgScore: parseFloat(row.avg_score),
    votedRequestsCount: row.voted_requests_count,
    totalRequestsCount: row.total_requests_count,
  };
}

export interface DecisionBreakdownRow {
  decision: string;
  count: number;
}

export async function getDecisionBreakdown(
  orgId: string,
  dateRange?: DateRange
): Promise<DecisionBreakdownRow[]> {
  const params: unknown[] = [orgId];
  let dateFilter = '';
  if (dateRange) {
    dateFilter = ` AND d.created_at >= $2 AND d.created_at <= $3`;
    params.push(dateRange.from, dateRange.to);
  }

  const result = await query(
    `SELECT d.decision, COUNT(*)::int AS count
     FROM decisions d
     JOIN feature_requests fr ON d.request_id = fr.id
     WHERE fr.organization_id = $1${dateFilter}
     GROUP BY d.decision
     ORDER BY count DESC`,
    params
  );

  return result.rows.map((row) => ({
    decision: row.decision,
    count: row.count,
  }));
}

export interface DecisionOutcomeDistributionRow {
  outcome: string;
  count: number;
}

export async function getDecisionOutcomeDistribution(
  orgId: string,
  dateRange?: DateRange
): Promise<DecisionOutcomeDistributionRow[]> {
  const params: unknown[] = [orgId];
  let dateFilter = '';
  if (dateRange) {
    dateFilter = ` AND d.created_at >= $2 AND d.created_at <= $3`;
    params.push(dateRange.from, dateRange.to);
  }

  const result = await query(
    `SELECT d.outcome, COUNT(*) AS count
     FROM decisions d
     JOIN feature_requests fr ON d.request_id = fr.id
     WHERE fr.organization_id = $1
       AND d.outcome IS NOT NULL${dateFilter}
     GROUP BY d.outcome
     ORDER BY count DESC`,
    params
  );

  return result.rows.map((row) => ({
    outcome: row.outcome,
    count: parseInt(row.count, 10),
  }));
}

// --- Burndown ---

export interface BurndownPoint {
  day: string; // YYYY-MM-DD
  openCount: number;
  idealCount: number;
}

/**
 * Daily burndown of the open backlog over a date range.
 *
 * "Open" = a feature request that has been created but has not yet
 * transitioned to status COMPLETED (per the activity_log). Replies on
 * STATUS_CHANGED events with metadata.to = 'COMPLETED' to determine when a
 * request was completed.
 *
 * Returns one point per day in the range with both the actual open count
 * and the ideal linear-burndown count (interpolated from the starting count
 * down to zero across the range).
 *
 * When no date range is provided, the previous 30 days are used.
 */
export async function getBacklogBurndown(
  orgId: string,
  dateRange?: DateRange
): Promise<BurndownPoint[]> {
  const now = new Date();
  const defaultFrom = new Date(now);
  defaultFrom.setDate(defaultFrom.getDate() - 30);
  const fromStr = dateRange?.from ?? defaultFrom.toISOString().slice(0, 10);
  const toStr = dateRange?.to ?? now.toISOString().slice(0, 10);

  // 1. Starting count = requests created before the range that had NOT
  //    transitioned to COMPLETED before the range start.
  const startResult = await query(
    `SELECT COUNT(*)::int AS count
     FROM feature_requests fr
     WHERE fr.organization_id = $1
       AND fr.created_at < $2::date
       AND NOT EXISTS (
         SELECT 1 FROM activity_log al
         WHERE al.organization_id = $1
           AND al.entity_id = fr.id
           AND al.action = 'STATUS_CHANGED'
           AND al.metadata->>'to' = 'COMPLETED'
           AND al.created_at < $2::date
       )`,
    [orgId, fromStr]
  );
  const startingCount = startResult.rows[0]?.count ?? 0;

  // 2. Per-day deltas within the range: +1 for each request created that
  //    day, -1 for each STATUS_CHANGED→COMPLETED event that day.
  const eventsResult = await query(
    `SELECT TO_CHAR(day, 'YYYY-MM-DD') AS day, SUM(delta)::int AS delta
     FROM (
       SELECT DATE(created_at) AS day, 1 AS delta
       FROM feature_requests
       WHERE organization_id = $1
         AND created_at >= $2::date
         AND created_at < ($3::date + INTERVAL '1 day')
       UNION ALL
       SELECT DATE(created_at) AS day, -1 AS delta
       FROM activity_log
       WHERE organization_id = $1
         AND action = 'STATUS_CHANGED'
         AND metadata->>'to' = 'COMPLETED'
         AND created_at >= $2::date
         AND created_at < ($3::date + INTERVAL '1 day')
     ) events
     GROUP BY day`,
    [orgId, fromStr, toStr]
  );
  const deltasByDay = new Map<string, number>();
  for (const row of eventsResult.rows) {
    deltasByDay.set(row.day, row.delta);
  }

  // 3. Walk day-by-day in JS to compute running open count + ideal line.
  const startDate = new Date(fromStr + 'T00:00:00Z');
  const endDate = new Date(toStr + 'T00:00:00Z');
  const totalDays = Math.max(
    1,
    Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1
  );

  const points: BurndownPoint[] = [];
  let openCount = startingCount;
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(startDate);
    d.setUTCDate(d.getUTCDate() + i);
    const dayStr = d.toISOString().slice(0, 10);
    openCount += deltasByDay.get(dayStr) ?? 0;
    // Ideal: linear interpolation from startingCount down to 0.
    const denom = Math.max(1, totalDays - 1);
    const idealCount = Math.max(
      0,
      Math.round(startingCount * (1 - i / denom))
    );
    points.push({ day: dayStr, openCount, idealCount });
  }

  return points;
}

// --- Per-User Dashboard Stats ---

export interface UserDashboardStats {
  myRequestsCount: number;
  myPendingCount: number;
  myCompletedCount: number;
  myAvgQualityScore: number | null;
  myVotesCount: number;
}

export async function getUserDashboardStats(
  orgId: string,
  userId: string
): Promise<UserDashboardStats> {
  const result = await query(
    `SELECT
       (SELECT COUNT(*)::int FROM feature_requests WHERE organization_id = $1 AND requester_id = $2) AS my_requests_count,
       (SELECT COUNT(*)::int FROM feature_requests WHERE organization_id = $1 AND requester_id = $2 AND status IN ('DRAFT', 'INTAKE_IN_PROGRESS', 'PENDING_ASSESSMENT', 'UNDER_REVIEW', 'NEEDS_INFO')) AS my_pending_count,
       (SELECT COUNT(*)::int FROM feature_requests WHERE organization_id = $1 AND requester_id = $2 AND status = 'COMPLETED') AS my_completed_count,
       (SELECT ROUND(AVG(quality_score)::numeric, 1) FROM feature_requests WHERE organization_id = $1 AND requester_id = $2 AND quality_score IS NOT NULL) AS my_avg_quality_score,
       (SELECT COUNT(*)::int FROM stakeholder_votes sv JOIN feature_requests fr ON sv.request_id = fr.id WHERE fr.organization_id = $1 AND sv.user_id = $2) AS my_votes_count`,
    [orgId, userId]
  );

  const row = result.rows[0];
  return {
    myRequestsCount: row.my_requests_count,
    myPendingCount: row.my_pending_count,
    myCompletedCount: row.my_completed_count,
    myAvgQualityScore: row.my_avg_quality_score != null ? parseFloat(row.my_avg_quality_score) : null,
    myVotesCount: row.my_votes_count,
  };
}
