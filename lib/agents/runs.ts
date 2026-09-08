import { query, transaction } from '@/lib/db/pool';
import { mapRow } from '@/lib/db/mappers';
import type { FeatureRequest, UserRole } from '@/lib/types/database';
import type { ToolSet } from 'ai';

export type AgentStage = 'intake' | 'assessment' | 'output' | 'security';
export interface AgentScope { requestId: string; orgId: string; userId: string; agent: AgentStage }
export interface AgentRunScope extends AgentScope { runId: string }
export class AgentAccessError extends Error {
  constructor(message: string, public status: number) { super(message); }
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
    const security = await query('SELECT id FROM security_reviews WHERE request_id = $1 AND organization_id = $2 LIMIT 1', [request.id, request.organizationId]);
    if (!security.rows.length) throw new AgentAccessError('Complete the security review first', 409);
  }
}

export async function beginAgentRun(scope: AgentScope): Promise<{ id: string }> {
  return transaction(async () => {
    const request = await lockAuthorizedRequest(scope);
    await assertStage(request, scope.agent);
    if (scope.agent === 'output') {
      const completed = await query(`SELECT id FROM agent_runs WHERE request_id = $1
        AND agent = 'output' AND result_complete = true`, [scope.requestId]);
      if (completed.rows.length) throw new AgentAccessError('Output generation is already complete', 409);
    }
    await query(`UPDATE agent_runs SET status = 'FAILED', finished_at = NOW(), error_code = 'EXPIRED'
      WHERE request_id = $1 AND status = 'RUNNING' AND expires_at <= clock_timestamp()`, [scope.requestId]);
    const running = await query("SELECT id FROM agent_runs WHERE request_id = $1 AND status = 'RUNNING'", [scope.requestId]);
    if (running.rows.length) throw new AgentAccessError('An agent is already running for this request', 409);
    if (scope.agent === 'intake' && request.status === 'DRAFT') {
      await query("UPDATE feature_requests SET status = 'INTAKE_IN_PROGRESS' WHERE id = $1", [scope.requestId]);
    }
    const result = await query(`INSERT INTO agent_runs(request_id, organization_id, user_id, agent)
      VALUES ($1, $2, $3, $4) RETURNING id`, [scope.requestId, scope.orgId, scope.userId, scope.agent]);
    return { id: result.rows[0].id as string };
  });
}

export async function finishAgentRun(runId: string, status: 'SUCCEEDED' | 'FAILED'): Promise<void> {
  await query(`UPDATE agent_runs SET status = $2, finished_at = NOW()
    WHERE id = $1 AND status = 'RUNNING'`, [runId, status]);
}

export async function withAgentMutation<T>(scope: AgentRunScope, work: () => Promise<T>, readOnly = false): Promise<T> {
  return transaction(async () => {
    const request = await lockAuthorizedRequest(scope);
    if (!readOnly) await assertStage(request, scope.agent);
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
