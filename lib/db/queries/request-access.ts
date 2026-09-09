import { query } from '@/lib/db/pool';
import { mapRow } from '@/lib/db/mappers';
import type { FeatureRequest, UserRole } from '@/lib/types/database';

/** Call inside transaction(): serialize mutations against archive/restore. */
export async function lockActiveMemberRequest(requestId: string, orgId: string | null, userId: string, reviewer = false): Promise<FeatureRequest & { actorRole: UserRole }> {
  const result = await query(`SELECT r.*,m.role AS actor_role FROM feature_requests r
    JOIN organization_users m ON m.organization_id=r.organization_id AND m.user_id=$3
    WHERE r.id=$1 AND r.organization_id=$2 FOR UPDATE OF r FOR SHARE OF m`, [requestId, orgId, userId]);
  if (!result.rowCount) throw new Error('Request not found or membership revoked.');
  const request = mapRow<FeatureRequest & { actorRole: UserRole }>(result.rows[0]);
  if (reviewer && request.actorRole !== 'ADMIN' && request.actorRole !== 'REVIEWER') throw new Error('Reviewer membership is required.');
  if (request.archivedAt) throw new Error('Restore this archived request before editing.');
  return request;
}
