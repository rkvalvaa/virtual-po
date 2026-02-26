import { query } from '@/lib/db/pool';
import { mapRow, mapRows } from '@/lib/db/mappers';
import type { SecurityReview, SecurityReviewCategory } from '@/lib/types/database';

export async function createSecurityReview(data: {
  requestId: string;
  organizationId: string;
  categories: SecurityReviewCategory[];
  overallSeverity: string;
  summary: string;
  recommendations: string[];
  requiresSecurityReview: boolean;
  gaps: string[];
}): Promise<SecurityReview> {
  const result = await query(
    `INSERT INTO security_reviews (
      request_id, organization_id, categories, overall_severity,
      summary, recommendations, requires_security_review, gaps
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *`,
    [
      data.requestId,
      data.organizationId,
      JSON.stringify(data.categories),
      data.overallSeverity,
      data.summary,
      data.recommendations,
      data.requiresSecurityReview,
      data.gaps,
    ]
  );
  return mapRow<SecurityReview>(result.rows[0]);
}

export async function getSecurityReviewByRequestId(
  requestId: string
): Promise<SecurityReview | null> {
  const result = await query(
    `SELECT * FROM security_reviews
     WHERE request_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [requestId]
  );
  if (result.rows.length === 0) return null;
  return mapRow<SecurityReview>(result.rows[0]);
}

export async function getSecurityReviewsRequiringReview(
  orgId: string,
  limit = 50,
  offset = 0
): Promise<{ reviews: SecurityReview[]; total: number }> {
  const countResult = await query(
    `SELECT COUNT(*) AS total FROM security_reviews
     WHERE organization_id = $1 AND requires_security_review = TRUE`,
    [orgId]
  );
  const total = parseInt(countResult.rows[0].total, 10);

  const dataResult = await query(
    `SELECT * FROM security_reviews
     WHERE organization_id = $1 AND requires_security_review = TRUE
     ORDER BY
       CASE overall_severity
         WHEN 'critical' THEN 1
         WHEN 'high' THEN 2
         WHEN 'medium' THEN 3
         WHEN 'low' THEN 4
         ELSE 5
       END,
       created_at DESC
     LIMIT $2 OFFSET $3`,
    [orgId, limit, offset]
  );

  return {
    reviews: mapRows<SecurityReview>(dataResult.rows),
    total,
  };
}
