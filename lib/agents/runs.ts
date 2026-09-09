import { query, transaction } from '@/lib/db/pool';
import { mapRow } from '@/lib/db/mappers';
import type { FeatureRequest, UserRole } from '@/lib/types/database';
import type { ToolSet } from 'ai';
import { AGENT_LIMITS } from './limits';
import { DEFAULT_AGENT_MODEL } from './pricing';
import { deploymentBudgetCeilingMicrousd } from './budget';
import { markAgentBudgetUnknown, reserveAgentBudget } from '@/lib/db/queries/agent-budget';

export type AgentStage = 'intake' | 'assessment' | 'output' | 'security';
export interface AgentScope { requestId: string; orgId: string; userId: string; agent: AgentStage }
export interface AgentRunScope extends AgentScope { runId: string }
export class AgentAccessError extends Error {
  constructor(message: string, public status: number, public retryAfter?: number) { super(message); }
}

export async function lockAuthorizedRequest(scope: AgentScope): Promise<FeatureRequest> {
  const result = await query(
    `SELECT r.*, ou.role AS actor_role FROM feature_requests r
     JOIN organization_users ou ON ou.organization_id = r.organization_id AND ou.user_id = $3
     WHERE r.id = $1 AND r.organization_id = $2 FOR UPDATE OF r FOR SHARE OF ou`,
    [scope.requestId, scope.orgId, scope.userId]);
  if (!result.rows[0]) throw new AgentAccessError('Request not found or membership revoked', 403);
  const request = mapRow<FeatureRequest>(result.rows[0]);
  const role = result.rows[0].actor_role as UserRole;
  if (request.requesterId !== scope.userId && role !== 'REVIEWER' && role !== 'ADMIN') {
    throw new AgentAccessError('Only the requester or a reviewer can run this agent', 403);
  }
  return request;
}

async function assertStage(request: FeatureRequest, agent: AgentStage): Promise<void> {
  if (request.archivedAt) throw new AgentAccessError('This request is archived. Restore it before running AI.', 409);
  if (agent === 'output' && request.humanRefined) throw new AgentAccessError('Human revisions are protected. Refine the generated content manually.', 409);
  const allowed = {
    intake: ['DRAFT', 'INTAKE_IN_PROGRESS'],
    assessment: ['PENDING_ASSESSMENT'],
    output: ['UNDER_REVIEW', 'APPROVED'],
    security: ['UNDER_REVIEW', 'APPROVED'],
  }[agent];
  if (!allowed.includes(request.status)) throw new AgentAccessError('This request is no longer in the required stage', 409);
  if (agent !== 'intake' && !request.intakeComplete) throw new AgentAccessError('Complete intake first', 409);
  if ((agent === 'output' || agent === 'security') && !request.assessmentData) throw new AgentAccessError('Complete assessment first', 409);
  if (agent === 'output') {
    const exported = await query('SELECT id FROM tracker_exports WHERE request_id = $1 AND organization_id = $2 LIMIT 1', [request.id, request.organizationId]);
    if (exported.rowCount) throw new AgentAccessError('Exported content is frozen. Edit the linked tracker content instead.', 409);
    const security = await query('SELECT id FROM security_reviews WHERE request_id = $1 AND organization_id = $2 LIMIT 1', [request.id, request.organizationId]);
    if (!security.rows.length) throw new AgentAccessError('Complete the security review first', 409);
  }
}

export async function beginAgentRun(scope: AgentScope, model = DEFAULT_AGENT_MODEL, runId?: string): Promise<{ id: string }> {
  return transaction(async () => {
    // Transaction-level locks coordinate every instance; use a consistent order.
    await query("SELECT pg_advisory_xact_lock(hashtextextended('agent-user:' || $1, 0))", [scope.userId]);
    await query("SELECT pg_advisory_xact_lock(hashtextextended('agent-org:' || $1, 0))", [scope.orgId]);
    const request = await lockAuthorizedRequest(scope);
    await assertStage(request, scope.agent);
    const limits = await query(`SELECT
      COUNT(*) FILTER (WHERE user_id = $1 AND created_at > clock_timestamp() - interval '1 hour')::int AS user_count,
      COUNT(*) FILTER (WHERE organization_id = $2 AND created_at > clock_timestamp() - interval '1 hour')::int AS org_count,
      COUNT(*) FILTER (WHERE organization_id = $2 AND status = 'RUNNING' AND expires_at > clock_timestamp())::int AS active
      FROM agent_runs WHERE (user_id = $1 OR organization_id = $2)
      AND (created_at > clock_timestamp() - interval '1 hour' OR (status = 'RUNNING' AND expires_at > clock_timestamp()))`, [scope.userId, scope.orgId]);
    const usage = limits.rows[0];
    if (usage.user_count >= AGENT_LIMITS.userRunsPerHour || usage.org_count >= AGENT_LIMITS.orgRunsPerHour) {
      throw new AgentAccessError('Hourly AI limit reached. Please retry in one hour.', 429, 3600);
    }
    if (usage.active >= AGENT_LIMITS.orgConcurrentRuns) {
      throw new AgentAccessError('Your organization already has three AI runs in progress. Retry in 30 seconds.', 429, 30);
    }
    if (scope.agent === 'output') {
      const completed = await query(`SELECT id FROM agent_runs WHERE request_id = $1
        AND agent = 'output' AND result_complete = true`, [scope.requestId]);
      if (completed.rows.length) throw new AgentAccessError('Output generation is already complete', 409);
    }
    await query(`UPDATE agent_runs SET status = 'FAILED', finished_at = NOW(), error_code = 'EXPIRED'
      WHERE request_id = $1 AND status = 'RUNNING' AND expires_at <= clock_timestamp()`, [scope.requestId]);
    await query(`UPDATE agent_budget_ledger ledger SET state='UNKNOWN',settlement_error_code='RUN_EXPIRED',settled_at=clock_timestamp()
      WHERE ledger.state='RESERVED' AND EXISTS (
        SELECT 1 FROM agent_runs run WHERE run.id=ledger.run_id AND run.request_id=$1 AND run.status='FAILED' AND run.error_code='EXPIRED'
      )`, [scope.requestId]);
    const running = await query("SELECT id FROM agent_runs WHERE request_id = $1 AND status = 'RUNNING'", [scope.requestId]);
    if (running.rows.length) throw new AgentAccessError('An agent is already running for this request', 409);
    if (scope.agent === 'intake' && request.status === 'DRAFT') {
      await query("UPDATE feature_requests SET status = 'INTAKE_IN_PROGRESS' WHERE id = $1", [scope.requestId]);
    }
    const result = await query(`INSERT INTO agent_runs(id,request_id, organization_id, user_id, agent, created_at, expires_at)
      VALUES (COALESCE($5::uuid,gen_random_uuid()),$1,$2,$3,$4,clock_timestamp(),clock_timestamp() + interval '3 minutes') RETURNING id`,
      [scope.requestId, scope.orgId, scope.userId, scope.agent, runId ?? null]);
    let deploymentCeilingMicrousd: number | null;
    try {
      deploymentCeilingMicrousd = deploymentBudgetCeilingMicrousd();
    } catch {
      throw new AgentAccessError('AI budget enforcement is misconfigured. Contact an administrator.', 503);
    }
    const budget = await reserveAgentBudget({ runId: result.rows[0].id, orgId: scope.orgId, model,
      deploymentCeilingMicrousd });
    if (!budget.allowed) {
      if (budget.reason === 'UNPRICED_MODEL' || budget.reason === 'UNPRICED_USAGE') {
        throw new AgentAccessError('AI budget enforcement cannot price the selected or current-month model usage.', 503);
      }
      const retryAfter = Math.max(1, Math.ceil((new Date(budget.resetAt).getTime() - Date.now()) / 1000));
      throw new AgentAccessError('Monthly AI budget reached. An administrator can review usage and reservations in Settings.', 429, retryAfter);
    }
    return { id: result.rows[0].id as string };
  });
}

export async function finishAgentRun(runId: string, status: 'SUCCEEDED' | 'FAILED'): Promise<void> {
  await transaction(async () => {
    await query(`UPDATE agent_runs SET status = $2, finished_at = NOW()
      WHERE id = $1 AND status = 'RUNNING'`, [runId, status]);
    await markAgentBudgetUnknown(runId, 'USAGE_NOT_RECORDED');
  });
}

export async function withAgentMutation<T>(scope: AgentRunScope, work: () => Promise<T>, readOnly = false): Promise<T> {
  return transaction(async () => {
    const request = await lockAuthorizedRequest(scope);
    if (!readOnly) await assertStage(request, scope.agent);
    if (request.archivedAt) throw new AgentAccessError('This request is archived. Restore it before running AI.', 409);
    const run = await query(`SELECT id FROM agent_runs WHERE id = $1 AND request_id = $2
      AND organization_id = $3 AND user_id = $4 AND agent = $5 AND status = 'RUNNING'
      AND expires_at > clock_timestamp() AND (result_complete = false OR $6) FOR UPDATE`,
      [scope.runId, scope.requestId, scope.orgId, scope.userId, scope.agent, readOnly]);
    if (!run.rows.length) throw new AgentAccessError('Agent run expired or was replaced; retry the operation', 409);
    return work();
  });
}

export function guardAgentTools<T extends ToolSet>(scope: AgentRunScope, tools: T): T {
  return Object.fromEntries(Object.entries(tools).map(([name, definition]) => {
    const execute = definition.execute;
    if (!execute) return [name, definition];
    return [name, { ...definition, execute: async (...args: Parameters<typeof execute>) =>
      withAgentMutation(scope, async () => execute(...args),
        name.startsWith('get_') || name === 'analyze_codebase_impact') }];
  })) as T;
}
