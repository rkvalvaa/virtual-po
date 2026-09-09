import { query, transaction } from '@/lib/db/pool';
import { z } from 'zod';

export async function setRequestArchived(requestId: string, orgId: string, userId: string, archived: boolean): Promise<void> {
  z.uuid().parse(requestId);
  await transaction(async () => {
    const result = await query(`SELECT r.*,m.role FROM feature_requests r
      JOIN organization_users m ON m.organization_id=r.organization_id AND m.user_id=$3
      WHERE r.id=$1 AND r.organization_id=$2 FOR UPDATE OF r FOR SHARE OF m`, [requestId, orgId, userId]);
    const request = result.rows[0];
    if (!request) throw new Error('Request not found or membership revoked.');
    if (request.role !== 'ADMIN' && request.role !== 'REVIEWER' && !(request.requester_id === userId && request.status === 'DRAFT')) {
      throw new Error('You may archive or restore your own drafts. A reviewer can manage other requests.');
    }
    if (!!request.archived_at === archived) return;
    const running = await query("SELECT id FROM agent_runs WHERE request_id=$1 AND status='RUNNING' AND expires_at>clock_timestamp()", [requestId]);
    if (running.rowCount) throw new Error('Wait for the active AI run before archiving this request.');
    const exporting = await query('SELECT id FROM tracker_exports WHERE request_id=$1 AND lease_until>clock_timestamp()', [requestId]);
    if (exporting.rowCount) throw new Error('Wait for the active tracker export before archiving this request.');
    await query(`UPDATE feature_requests SET archived_at=CASE WHEN $3 THEN clock_timestamp() ELSE NULL END,
      archived_by=CASE WHEN $3 THEN $4::uuid ELSE NULL END,updated_at=clock_timestamp() WHERE id=$1 AND organization_id=$2`, [requestId, orgId, archived, userId]);
    await query(`INSERT INTO activity_log(organization_id,request_id,user_id,action,entity_type,entity_id,metadata)
      VALUES($1,$2,$3,'REQUEST_UPDATED','REQUEST',$2,$4)`, [orgId, requestId, userId, { archiveAction: archived ? 'ARCHIVE' : 'RESTORE', preservedStatus: request.status }]);
  });
}

export async function bulkSetRequestArchived(ids: string[], orgId: string, userId: string, archived: boolean) {
  const requestIds = z.array(z.uuid()).min(1).max(100).parse(ids);
  const results: { requestId: string; success: boolean; error?: string }[] = [];
  for (const requestId of new Set(requestIds)) {
    try { await setRequestArchived(requestId, orgId, userId, archived); results.push({ requestId, success: true }); }
    catch (error) { results.push({ requestId, success: false, error: error instanceof Error ? error.message : 'Unable to update this request.' }); }
  }
  return results;
}
