import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { query, transaction } from '@/lib/db/pool';
import { canAccess } from '@/lib/auth/rbac';
import { getApplicationBaseUrl } from '@/lib/email/config';
import { getIntegrationByType } from '@/lib/db/queries/jira-sync';
import { getLinearClientFromIntegration, type createLinearClient } from '@/lib/linear/client';
import { log } from '@/lib/logging/logger';
import type { UserRole } from '@/lib/types/database';
import { advanceExport, type ExportAdapter, type ExportItem } from './durable';
import { exportMarker } from './content';

/**
 * Change-request delivery (CCT-2441): each change request filed by a form with a
 * Linear destination becomes one Linear issue, created by a cron with bounded
 * retries. It reuses the durable export manifest, lease and recovery; Linear
 * issues are created with our own id, so a lost response is found again by id
 * and a second create with that id cannot duplicate it.
 */

export const linearDestinationSchema = z.object({
  integration: z.literal('LINEAR'),
  teamId: z.string().min(1).max(100),
  projectId: z.string().min(1).max(100).nullable(),
});
export type LinearDestination = z.infer<typeof linearDestinationSchema>;
export type LinearDeliveryClient = Pick<ReturnType<typeof createLinearClient>, 'createIssue' | 'getIssue' | 'getTeams' | 'getProjects'>;
type ClientFor = (integration: { config: Record<string, unknown> }) => LinearDeliveryClient;

export type DeliveryStatus = 'QUEUED' | 'DELIVERED' | 'NEEDS_ATTENTION' | 'FAILED';
export interface Delivery { status: DeliveryStatus; url: string | null; error: string | null; attempts: number; nextAttemptAt: string | null }

export const MAX_DELIVERY_ATTEMPTS = 5;
const BACKOFF_MINUTES = [1, 5, 15, 60];

/** Refuse a destination the connected Linear account cannot reach. */
export async function verifyLinearDestination(orgId: string, destination: LinearDestination, clientFor: ClientFor = getLinearClientFromIntegration): Promise<void> {
  const integration = await getIntegrationByType(orgId, 'LINEAR');
  if (!integration) throw new Error('Connect Linear in Settings before choosing a Linear destination.');
  const client = clientFor(integration);
  const teams = await client.getTeams();
  if (!teams.some(team => team.id === destination.teamId)) throw new Error('The connected Linear account cannot reach that team.');
  if (destination.projectId && !(await client.getProjects(destination.teamId)).some(project => project.id === destination.projectId)) {
    throw new Error('That Linear project is not in the chosen team.');
  }
}

/** Teams and their projects for the Settings picker; null if Linear cannot be reached. */
export async function listLinearDestinations(integration: { config: Record<string, unknown> }, clientFor: ClientFor = getLinearClientFromIntegration):
  Promise<{ id: string; name: string; projects: { id: string; name: string }[] }[] | null> {
  try {
    const client = clientFor(integration);
    const teams = await client.getTeams();
    return await Promise.all(teams.map(async team => ({
      id: team.id, name: team.name, projects: (await client.getProjects(team.id)).map(project => ({ id: project.id, name: project.name })),
    })));
  } catch (error) {
    log.warn('delivery.linear_teams_unavailable', { err: error });
    return null;
  }
}

/** Queue delivery of a new change request. Call inside the transaction that creates it. */
export async function enqueueServiceTicket(params: {
  requestId: string; orgId: string; destination: LinearDestination; title: string; summary: string;
}): Promise<void> {
  const item: ExportItem = {
    id: randomUUID(), entityId: params.requestId, kind: 'SERVICE_TICKET', state: 'ready', title: params.title,
    // Mapped fields only. Files stay in VPO behind sign-in; the link leads to them.
    body: [params.summary, requestLink(params.requestId)].filter(Boolean).join('\n\n'),
  };
  await query(`INSERT INTO tracker_exports (request_id, organization_id, provider, destination, items, delivery_status, next_attempt_at)
    VALUES ($1, $2, 'LINEAR', $3, $4, 'QUEUED', clock_timestamp())`,
    [params.requestId, params.orgId, JSON.stringify([params.destination.teamId, params.destination.projectId]), JSON.stringify([item])]);
}

function requestLink(requestId: string): string | null {
  try { return `Filed in VPO, where attachments and discussion live: ${getApplicationBaseUrl()}/requests/${requestId}`; }
  catch (error) { log.warn('delivery.no_app_url', { err: error }); return null; } // ponytail: the ticket still goes out, without the link back
}

/** Deliver what is due. Concurrent runs never claim the same row. */
export async function processDeliveries(options: { clientFor?: ClientFor; limit?: number } = {}): Promise<{ processed: number }> {
  const token = randomUUID();
  const claimed = await query<{ id: string; organization_id: string; destination: string; items: ExportItem[]; attempts: number }>(
    `UPDATE tracker_exports SET lease_token = $1, lease_until = clock_timestamp() + interval '2 minutes'
     WHERE id IN (SELECT id FROM tracker_exports WHERE delivery_status = 'QUEUED' AND next_attempt_at <= clock_timestamp()
       AND (lease_until IS NULL OR lease_until < clock_timestamp()) ORDER BY next_attempt_at LIMIT $2 FOR UPDATE SKIP LOCKED)
     RETURNING id, organization_id, destination, items, attempts`, [token, options.limit ?? 10]);
  for (const row of claimed.rows) {
    try { await deliver(row, token, options.clientFor ?? getLinearClientFromIntegration); }
    catch (error) { log.error('delivery.failed', { exportId: row.id, err: error }); }
  }
  return { processed: claimed.rowCount ?? 0 };
}

async function deliver(row: { id: string; organization_id: string; destination: string; items: ExportItem[]; attempts: number },
  token: string, clientFor: ClientFor): Promise<void> {
  const attempts = row.attempts + 1;
  const integration = await getIntegrationByType(row.organization_id, 'LINEAR');
  if (!integration) return settle(row.id, token, attempts, 'NEEDS_ATTENTION', 'Linear is not connected. Connect it in Settings, then replay.');
  const [teamId, projectId] = JSON.parse(row.destination) as [string, string | null];
  const client = clientFor(integration);
  const adapter: ExportAdapter = {
    create: item => client.createIssue(teamId, item.title, `${item.body}\n\nExport reference: ${exportMarker(item.id)}`, undefined, item.id, projectId ?? undefined),
    recover: async item => {
      try { return await client.getIssue(item.id); }
      catch (error) { if (error instanceof Error && /not found/i.test(error.message)) return null; throw error; }
    },
    finish: async () => {},
  };
  const result = await advanceExport(row.id, token, row.items, adapter);
  const [item] = result.items;
  if (result.status === 'complete') return settle(row.id, token, attempts, 'DELIVERED', null);
  if (!item.retryable) return settle(row.id, token, attempts, 'NEEDS_ATTENTION', item.error ?? 'Delivery needs attention.');
  if (attempts >= MAX_DELIVERY_ATTEMPTS) return settle(row.id, token, attempts, 'FAILED', item.error ?? 'Delivery failed.');
  await settle(row.id, token, attempts, 'QUEUED', item.error ?? null, BACKOFF_MINUTES[Math.min(attempts, BACKOFF_MINUTES.length) - 1]);
}

async function settle(id: string, token: string, attempts: number, status: DeliveryStatus, error: string | null, retryInMinutes?: number) {
  await query(`UPDATE tracker_exports SET delivery_status = $3, attempts = $4, last_error = $5,
      next_attempt_at = CASE WHEN $3 = 'QUEUED' THEN clock_timestamp() + make_interval(mins => $6) END,
      lease_token = NULL, lease_until = NULL, updated_at = clock_timestamp()
    WHERE id = $1 AND (lease_token = $2 OR lease_token IS NULL)`, [id, token, status, attempts, error?.slice(0, 1000) ?? null, retryInMinutes ?? 0]);
}

export async function getDelivery(requestId: string, orgId: string): Promise<Delivery | null> {
  const found = await query(`SELECT delivery_status, items, last_error, attempts, next_attempt_at FROM tracker_exports
    WHERE request_id = $1 AND organization_id = $2 AND delivery_status IS NOT NULL`, [requestId, orgId]);
  const row = found.rows[0];
  if (!row) return null;
  return { status: row.delivery_status, url: (row.items as ExportItem[])[0]?.external?.url ?? null, error: row.last_error,
    attempts: row.attempts, nextAttemptAt: row.next_attempt_at?.toISOString() ?? null };
}

/**
 * Queue a stuck or failed delivery again (REVIEWER or ADMIN). A person replaying
 * has checked Linear, so an unknown outcome is created again, with the same
 * issue id, which Linear refuses to duplicate.
 */
export async function replayDelivery(requestId: string, orgId: string, userId: string): Promise<void> {
  await transaction(async () => {
    const member = await query<{ role: UserRole }>('SELECT role FROM organization_users WHERE organization_id = $1 AND user_id = $2', [orgId, userId]);
    if (!member.rows[0] || !canAccess(member.rows[0].role, 'REVIEWER')) throw new Error('Only a reviewer or admin can replay a delivery.');
    const found = await query<{ id: string; items: ExportItem[] }>(`SELECT id, items FROM tracker_exports WHERE request_id = $1 AND organization_id = $2
      AND delivery_status IN ('NEEDS_ATTENTION', 'FAILED') AND (lease_until IS NULL OR lease_until < clock_timestamp()) FOR UPDATE`, [requestId, orgId]);
    if (!found.rows[0]) throw new Error('There is no failed delivery to replay.');
    const items = found.rows[0].items.map(item => item.state === 'unknown' ? { ...item, state: 'ready' as const } : item);
    await query(`UPDATE tracker_exports SET delivery_status = 'QUEUED', attempts = 0, next_attempt_at = clock_timestamp(), items = $2, updated_at = clock_timestamp()
      WHERE id = $1`, [found.rows[0].id, JSON.stringify(items)]);
  });
}
