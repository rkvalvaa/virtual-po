import { randomUUID } from 'node:crypto';
import { query, transaction } from '@/lib/db/pool';
import { ExportRejected } from './errors';

export interface ExternalItem { id: string; url: string; nodeId?: string }
export interface ExportInputItem { entityId: string; kind: 'EPIC' | 'STORY'; title: string; body: string; existing?: ExternalItem }
export interface ExportItem extends ExportInputItem { id: string; state: 'ready' | 'unknown' | 'created' | 'complete'; external?: ExternalItem; error?: string }
export interface ExportAdapter {
  create(item: ExportItem, parent?: ExternalItem): Promise<ExternalItem>;
  recover(item: ExportItem): Promise<ExternalItem | null>;
  finish(item: ExportItem, parent?: ExternalItem): Promise<void>;
}
export interface ExportResult { success: boolean; status: 'complete' | 'partial' | 'failed'; items: ExportItem[]; error?: string }
export interface ExportInput { requestId: string; orgId: string; userId: string; provider: 'LINEAR' | 'JIRA' | 'GITHUB_ISSUES'; destination: string; items: ExportInputItem[] | (() => Promise<ExportInputItem[]>) }

/** Only an explicit rejection guarantees that no remote item was created. */

export function summarizeExport(items: ExportItem[]): ExportResult {
  const complete = items.filter(item => item.state === 'complete').length;
  const status = complete === items.length ? 'complete' : items.some(item => item.external) ? 'partial' : 'failed';
  return { success: status === 'complete', status, items, error: status === 'complete' ? undefined : `${complete}/${items.length} items complete. Retry to resume saved progress.` };
}

export async function getExportStatus(requestId: string, orgId: string) {
  const result = await query<{ provider: ExportInput['provider']; items: ExportItem[] }>('SELECT provider, items FROM tracker_exports WHERE request_id = $1 AND organization_id = $2', [requestId, orgId]);
  return result.rows.map(row => ({ provider: row.provider, ...summarizeExport(row.items) }));
}

export async function runExport(input: ExportInput, adapter: ExportAdapter): Promise<ExportResult> {
  const token = randomUUID();
  const manifest = await transaction(async () => {
    // Same request lock used by refinement/agents: the first manifest freezes content.
    const authorized = await query(`SELECT r.id, r.human_refined, r.status, r.archived_at FROM feature_requests r
      JOIN organization_users m ON m.organization_id = r.organization_id AND m.user_id = $3
      WHERE r.id = $1 AND r.organization_id = $2 AND m.role IN ('ADMIN', 'REVIEWER') FOR UPDATE OF r FOR SHARE OF m`, [input.requestId, input.orgId, input.userId]);
    if (!authorized.rowCount) throw new Error('Request not found or insufficient permissions.');
    if (authorized.rows[0].archived_at) throw new Error('Restore this archived request before exporting.');
    if (authorized.rows[0].human_refined && !['APPROVED', 'IN_BACKLOG', 'IN_PROGRESS', 'COMPLETED'].includes(authorized.rows[0].status)) throw new Error('Approve the revised request before exporting.');
    const running = await query("SELECT id FROM agent_runs WHERE request_id = $1 AND status = 'RUNNING' AND expires_at > clock_timestamp()", [input.requestId]);
    if (running.rowCount) throw new Error('Wait for the active AI agent before exporting.');
    const source = typeof input.items === 'function' ? await input.items() : input.items;
    const items: ExportItem[] = source.map(item => ({ ...item, id: randomUUID(), state: item.existing ? 'complete' : 'ready', external: item.existing }));
    await query(`INSERT INTO tracker_exports (request_id, organization_id, provider, destination, items)
      VALUES ($1, $2, $3, $4, $5) ON CONFLICT (request_id, provider) DO NOTHING`, [input.requestId, input.orgId, input.provider, input.destination, JSON.stringify(items)]);
    const existing = await query('SELECT destination FROM tracker_exports WHERE request_id = $1 AND organization_id = $2 AND provider = $3', [input.requestId, input.orgId, input.provider]);
    if (existing.rows[0].destination !== input.destination) throw new Error('This export is bound to its original destination. Restore the original integration destination to resume.');
    const claimed = await query<{ id: string; items: ExportItem[] }>(`UPDATE tracker_exports SET lease_token = $4, lease_until = clock_timestamp() + interval '2 minutes'
      WHERE request_id = $1 AND organization_id = $2 AND provider = $3 AND (lease_until IS NULL OR lease_until < clock_timestamp()) RETURNING id, items`, [input.requestId, input.orgId, input.provider, token]);
    if (!claimed.rowCount) throw new Error('An export is already in progress. Refresh shortly to see its progress.');
    return claimed.rows[0];
  });
  const items = manifest.items;
  async function persist() {
    const result = await query(`UPDATE tracker_exports SET items = $3, updated_at = clock_timestamp(), lease_until = clock_timestamp() + interval '2 minutes'
      WHERE id = $1 AND lease_token = $2 AND lease_until > clock_timestamp()
      AND EXISTS (SELECT 1 FROM organization_users WHERE organization_id = $4 AND user_id = $5 AND role IN ('ADMIN', 'REVIEWER'))`, [manifest.id, token, JSON.stringify(items), input.orgId, input.userId]);
    if (!result.rowCount) throw new Error('Export lease expired. Retry to reconcile saved progress.');
  }
  try {
    for (const item of items) {
      if (item.state === 'complete') continue;
      const parent = items[0].external;
      if (item.kind === 'STORY' && !parent) break;
      await persist();
      try {
        if (item.state === 'unknown') {
          const recovered = await adapter.recover(item);
          if (!recovered) throw new Error('Creation outcome is unknown. Retry reconciliation after checking the tracker; a new item will not be created automatically.');
          item.external = recovered;
          item.state = 'created';
          await persist();
        }
        if (item.state === 'ready') {
          item.state = 'unknown';
          await persist(); // Crash/timeout after this point must reconcile, never blindly recreate.
          try { item.external = await adapter.create(item, parent); }
          catch (error) { if (error instanceof ExportRejected) item.state = 'ready'; throw error; }
          item.state = 'created';
          await persist();
        }
        await adapter.finish(item, parent);
        item.state = 'complete';
        delete item.error;
      } catch (error) { item.error = error instanceof Error ? error.message : 'Export failed. Retry to resume.'; }
      await persist();
    }
    return summarizeExport(items);
  } finally {
    await query('UPDATE tracker_exports SET lease_token = NULL, lease_until = NULL WHERE id = $1 AND lease_token = $2', [manifest.id, token]);
  }
}
