import { query } from '@/lib/db/pool';

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

export async function getDashboardSummary(orgId: string): Promise<DashboardSummary> {
  const result = await query(
    `SELECT
       COUNT(*) AS total_requests,
       COUNT(*) FILTER (WHERE status IN ('UNDER_REVIEW', 'NEEDS_INFO')) AS pending_review,
       COUNT(*) FILTER (WHERE status IN ('APPROVED', 'IN_BACKLOG', 'IN_PROGRESS')) AS in_backlog,
       COUNT(*) FILTER (WHERE status = 'COMPLETED') AS completed,
       ROUND(AVG(quality_score) FILTER (WHERE quality_score IS NOT NULL)) AS avg_quality_score
     FROM feature_requests
     WHERE organization_id = $1`,
    [orgId]
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

export async function getStatusDistribution(orgId: string): Promise<StatusDistributionRow[]> {
  const result = await query(
    `SELECT status, COUNT(*) AS count
     FROM feature_requests
     WHERE organization_id = $1
     GROUP BY status
     ORDER BY count DESC`,
    [orgId]
  );

  return result.rows.map((row) => ({
    status: row.status,
    count: parseInt(row.count, 10),
  }));
}

export async function getRequestVolumeByMonth(orgId: string): Promise<RequestVolumeRow[]> {
  const result = await query(
    `SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month,
            COUNT(*) AS count
     FROM feature_requests
     WHERE organization_id = $1
       AND created_at >= NOW() - INTERVAL '12 months'
     GROUP BY DATE_TRUNC('month', created_at)
     ORDER BY month ASC`,
    [orgId]
  );

  return result.rows.map((row) => ({
    month: row.month,
    count: parseInt(row.count, 10),
  }));
}

export async function getPriorityDistribution(orgId: string): Promise<PriorityDistributionRow[]> {
  const result = await query(
    `SELECT
       CASE
         WHEN priority_score >= 75 THEN 'High'
         WHEN priority_score >= 50 THEN 'Medium'
         WHEN priority_score IS NOT NULL THEN 'Low'
         ELSE 'Unscored'
       END AS band,
       COUNT(*) AS count
     FROM feature_requests
     WHERE organization_id = $1
     GROUP BY band
     ORDER BY
       CASE band WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 WHEN 'Low' THEN 3 ELSE 4 END`,
    [orgId]
  );

  return result.rows.map((row) => ({
    band: row.band,
    count: parseInt(row.count, 10),
  }));
}

export async function getAverageTimeToDecision(orgId: string): Promise<AverageTimeToDecision> {
  const result = await query(
    `SELECT ROUND(AVG(EXTRACT(EPOCH FROM (d.created_at - fr.created_at)) / 86400)::numeric, 1) AS avg_days
     FROM decisions d
     JOIN feature_requests fr ON d.request_id = fr.id
     WHERE fr.organization_id = $1`,
    [orgId]
  );

  const row = result.rows[0];
  return {
    avgDays: row.avg_days != null ? parseFloat(row.avg_days) : null,
  };
}

export async function getTopRequesters(
  orgId: string,
  limit = 5
): Promise<TopRequesterRow[]> {
  const result = await query(
    `SELECT u.id AS user_id, u.name, COUNT(*) AS count
     FROM feature_requests fr
     JOIN users u ON fr.requester_id = u.id
     WHERE fr.organization_id = $1
     GROUP BY u.id, u.name
     ORDER BY count DESC
     LIMIT $2`,
    [orgId, limit]
  );

  return result.rows.map((row) => ({
    userId: row.user_id,
    name: row.name,
    count: parseInt(row.count, 10),
  }));
}
