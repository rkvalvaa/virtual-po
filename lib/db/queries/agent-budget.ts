import { query, transaction } from '@/lib/db/pool';
import { measuredCostMicrousd, maxAgentReservationMicrousd } from '@/lib/agents/budget';
import { notifyUser } from './notifications';
import { AGENT_LIMITS } from '@/lib/agents/limits';

export interface AgentBudgetStatus {
  enabled: boolean;
  deploymentCeilingMicrousd: number | null;
  configuredLimitMicrousd: number | null;
  effectiveLimitMicrousd: number | null;
  measuredMicrousd: number;
  reservedMicrousd: number;
  unknownReservedMicrousd: number;
  remainingMicrousd: number | null;
  unknownSettlements: number;
  resetAt: string;
  version: number;
  warningPercent: number;
  blockReason: string | null;
  userRunsRemaining: number;
  orgRunsRemaining: number;
  concurrentRunsRemaining: number;
  userRunResetAt: string | null;
  orgRunResetAt: string | null;
}

export async function updateOrganizationAgentBudget(input: {
  orgId: string;
  adminUserId: string;
  monthlyLimitMicrousd: number;
  warningPercent: number;
  expectedVersion: number;
  deploymentCeilingMicrousd: number;
}): Promise<{ version: number }> {
  if (!Number.isSafeInteger(input.monthlyLimitMicrousd) || input.monthlyLimitMicrousd <= 0 ||
      input.monthlyLimitMicrousd > input.deploymentCeilingMicrousd) {
    throw new Error('The monthly limit must stay within the deployment ceiling.');
  }
  if (!Number.isInteger(input.warningPercent) || input.warningPercent < 1 || input.warningPercent > 100) {
    throw new Error('The warning threshold must be between 1 and 100 percent.');
  }
  return transaction(async () => {
    await query("SELECT pg_advisory_xact_lock(hashtextextended('agent-org:' || $1, 0))", [input.orgId]);
    const admin = await query(`SELECT user_id FROM organization_users
      WHERE organization_id=$1 AND user_id=$2 AND role='ADMIN' FOR SHARE`, [input.orgId, input.adminUserId]);
    if (!admin.rowCount) throw new Error('A current workspace administrator is required.');
    const current = await query<{ version: number }>(
      'SELECT version FROM organization_ai_budgets WHERE organization_id=$1 FOR UPDATE', [input.orgId]);
    const version = current.rows[0]?.version ?? 0;
    if (version !== input.expectedVersion) throw new Error('The budget configuration changed. Reload and try again.');
    const updated = await query<{ version: number }>(`INSERT INTO organization_ai_budgets(
      organization_id,monthly_limit_microusd,warning_percent,version,updated_by)
      VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(organization_id) DO UPDATE SET monthly_limit_microusd=EXCLUDED.monthly_limit_microusd,
        warning_percent=EXCLUDED.warning_percent,version=EXCLUDED.version,updated_by=EXCLUDED.updated_by,
        updated_at=clock_timestamp()
      RETURNING version`, [input.orgId, input.monthlyLimitMicrousd, input.warningPercent, version + 1, input.adminUserId]);
    return { version: updated.rows[0].version };
  });
}

export async function reserveAgentBudget(input: {
  runId: string; orgId: string; model: string; deploymentCeilingMicrousd: number | null;
}): Promise<{ allowed: boolean; enabled: boolean; resetAt: string; remainingMicrousd: number | null; reason?: 'UNPRICED_MODEL' | 'UNPRICED_USAGE' | 'BUDGET_EXHAUSTED' }> {
 return transaction(async () => {
  await query("SELECT pg_advisory_xact_lock(hashtextextended('agent-org:' || $1, 0))", [input.orgId]);
  const window = await query<{ start_at: Date; reset_at: Date }>(`SELECT
    date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS start_at,
    (date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC') + interval '1 month') AT TIME ZONE 'UTC' AS reset_at`);
  const resetAt = window.rows[0].reset_at.toISOString();
  const reserved = maxAgentReservationMicrousd(input.model);
  if (input.deploymentCeilingMicrousd === null) {
    await query(`INSERT INTO agent_budget_ledger(run_id,organization_id,model,window_start,reserved_microusd,state,settlement_error_code)
      VALUES($1,$2,$3,$4,$5,$6,$7)`, [input.runId, input.orgId, input.model, window.rows[0].start_at,
      reserved ?? 0, reserved === null ? 'UNKNOWN' : 'RESERVED', reserved === null ? 'UNPRICED_MODEL' : null]);
    return { allowed: true, enabled: false, resetAt, remainingMicrousd: null };
  }
  if (reserved === null) return { allowed: false, enabled: true, resetAt, remainingMicrousd: null, reason: 'UNPRICED_MODEL' };
  const config = await query<{ monthly_limit_microusd: string; warning_percent: number }>(
    'SELECT monthly_limit_microusd,warning_percent FROM organization_ai_budgets WHERE organization_id=$1', [input.orgId]);
  const configured = config.rows[0] ? Number(config.rows[0].monthly_limit_microusd) : input.deploymentCeilingMicrousd;
  const warningPercent = config.rows[0]?.warning_percent ?? 80;
  const effective = Math.min(configured, input.deploymentCeilingMicrousd);
  const spend = await query<{ committed: string; has_unpriced: boolean }>(`SELECT COALESCE(SUM(
    CASE WHEN state='MEASURED' THEN settled_microusd ELSE reserved_microusd END),0)::text AS committed,
    COALESCE(BOOL_OR(settlement_error_code='UNPRICED_MODEL'),false) AS has_unpriced
    FROM agent_budget_ledger WHERE organization_id=$1 AND window_start=$2`, [input.orgId, window.rows[0].start_at]);
  const committed = Number(spend.rows[0].committed);
  const legacy = await getUnlinkedUsageCost(input.orgId, window.rows[0].start_at);
  if (legacy.unpriced || spend.rows[0].has_unpriced) {
    return { allowed: false, enabled: true, resetAt, remainingMicrousd: null, reason: 'UNPRICED_USAGE' };
  }
  const totalCommitted = committed + legacy.microusd;
  if (totalCommitted + reserved > effective) {
    return { allowed: false, enabled: true, resetAt, remainingMicrousd: Math.max(0, effective - totalCommitted), reason: 'BUDGET_EXHAUSTED' };
  }
  await query(`INSERT INTO agent_budget_ledger(run_id,organization_id,model,window_start,reserved_microusd)
    VALUES($1,$2,$3,$4,$5)`, [input.runId, input.orgId, input.model, window.rows[0].start_at, reserved]);
  const nextCommitted = totalCommitted + reserved;
  if (nextCommitted * 100 >= effective * warningPercent) {
    const alert = await query(`INSERT INTO organization_ai_budget_alerts(organization_id,window_start,threshold_percent)
      VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING organization_id`,
      [input.orgId, window.rows[0].start_at, warningPercent]);
    if (alert.rowCount) {
      const admins = await query<{ user_id: string }>(`SELECT user_id FROM organization_users
        WHERE organization_id=$1 AND role='ADMIN' ORDER BY user_id`, [input.orgId]);
      for (const admin of admins.rows) {
        await notifyUser({
          organizationId: input.orgId,
          userId: admin.user_id,
          type: 'AI_BUDGET_WARNING',
          title: 'AI budget warning',
          message: `Estimated AI spend and held reservations reached ${warningPercent}% of this workspace's monthly limit.`,
          link: '/settings#ai-budget',
        });
      }
    }
  }
  return { allowed: true, enabled: true, resetAt, remainingMicrousd: effective - nextCommitted };
 });
}

async function getUnlinkedUsageCost(orgId: string, windowStart: Date): Promise<{ microusd: number; unpriced: boolean }> {
  const usage = await query<{ model: string; input_tokens: string; output_tokens: string }>(`SELECT model,
    COALESCE(SUM(input_tokens),0)::text AS input_tokens,COALESCE(SUM(output_tokens),0)::text AS output_tokens
    FROM agent_usage WHERE organization_id=$1 AND agent_run_id IS NULL AND created_at >= $2 GROUP BY model`,
    [orgId, windowStart]);
  let microusd = 0;
  for (const row of usage.rows) {
    const cost = measuredCostMicrousd(row.model, Number(row.input_tokens), Number(row.output_tokens));
    if (cost === null) return { microusd, unpriced: true };
    microusd += cost;
  }
  return { microusd, unpriced: false };
}

export async function markAgentBudgetUnknown(runId: string, errorCode: string): Promise<void> {
  await query(`UPDATE agent_budget_ledger SET state='UNKNOWN',settlement_error_code=$2,settled_at=clock_timestamp()
    WHERE run_id=$1 AND state='RESERVED'`, [runId, errorCode]);
}

export async function settleMeasuredAgentBudget(input: {
  runId: string; model: string; inputTokens: number; outputTokens: number;
}): Promise<void> {
  await transaction(async () => {
    const ledger = await query<{ model: string }>('SELECT model FROM agent_budget_ledger WHERE run_id=$1 FOR UPDATE', [input.runId]);
    if (!ledger.rows[0]) throw new Error('Agent budget reservation was not found.');
    if (ledger.rows[0].model !== input.model) throw new Error('Agent usage model does not match the reserved model.');
    const cost = measuredCostMicrousd(ledger.rows[0].model, input.inputTokens, input.outputTokens);
    if (cost === null) {
      await markAgentBudgetUnknown(input.runId, 'UNPRICED_MODEL');
      return;
    }
    await query(`UPDATE agent_budget_ledger SET state='MEASURED',settled_microusd=$2,input_tokens=$3,output_tokens=$4,
      settlement_error_code=NULL,settled_at=clock_timestamp() WHERE run_id=$1`,
      [input.runId, cost, input.inputTokens, input.outputTokens]);
  });
}

export async function getAgentBudgetStatus(
  orgId: string,
  userId: string,
  deploymentCeilingMicrousd: number | null,
): Promise<AgentBudgetStatus | null> {
  const result = await query<{
    configured: string | null; version: number | null; warning_percent: number | null;
    measured: string; reserved: string; unknown_reserved: string; unknown_count: number;
    reset_at: Date; start_at: Date;
    user_run_count: number; org_run_count: number; active_count: number;
    user_run_reset_at: Date | null; org_run_reset_at: Date | null;
    unpriced_ledger_count: number;
  }>(`WITH authorized AS (
      SELECT 1 FROM organization_users WHERE organization_id=$1 AND user_id=$2
    ), budget_window AS (
      SELECT date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS start_at,
        (date_trunc('month',clock_timestamp() AT TIME ZONE 'UTC') + interval '1 month') AT TIME ZONE 'UTC' AS reset_at
    ), run_stats AS (
      SELECT
        COUNT(*) FILTER (WHERE user_id=$2 AND created_at > clock_timestamp() - interval '1 hour')::int AS user_run_count,
        COUNT(*) FILTER (WHERE organization_id=$1 AND created_at > clock_timestamp() - interval '1 hour')::int AS org_run_count,
        COUNT(*) FILTER (WHERE organization_id=$1 AND status='RUNNING' AND expires_at > clock_timestamp())::int AS active_count,
        MIN(created_at + interval '1 hour') FILTER (WHERE user_id=$2 AND created_at > clock_timestamp() - interval '1 hour') AS user_run_reset_at,
        MIN(created_at + interval '1 hour') FILTER (WHERE organization_id=$1 AND created_at > clock_timestamp() - interval '1 hour') AS org_run_reset_at
      FROM agent_runs WHERE user_id=$2 OR organization_id=$1
    )
    SELECT budget.monthly_limit_microusd::text AS configured,budget.version,budget.warning_percent,
      COALESCE(SUM(ledger.settled_microusd) FILTER (WHERE ledger.state='MEASURED'),0)::text AS measured,
      COALESCE(SUM(ledger.reserved_microusd) FILTER (WHERE ledger.state='RESERVED'),0)::text AS reserved,
      COALESCE(SUM(ledger.reserved_microusd) FILTER (WHERE ledger.state='UNKNOWN'),0)::text AS unknown_reserved,
      COUNT(ledger.run_id) FILTER (WHERE ledger.state='UNKNOWN')::int AS unknown_count,budget_window.reset_at,budget_window.start_at,
      COUNT(ledger.run_id) FILTER (WHERE ledger.settlement_error_code='UNPRICED_MODEL')::int AS unpriced_ledger_count,
      run_stats.user_run_count,run_stats.org_run_count,run_stats.active_count,
      run_stats.user_run_reset_at,run_stats.org_run_reset_at
    FROM authorized CROSS JOIN budget_window CROSS JOIN run_stats
    LEFT JOIN organization_ai_budgets budget ON budget.organization_id=$1
    LEFT JOIN agent_budget_ledger ledger ON ledger.organization_id=$1 AND ledger.window_start=budget_window.start_at
    GROUP BY budget.monthly_limit_microusd,budget.version,budget.warning_percent,budget_window.reset_at,budget_window.start_at,
      run_stats.user_run_count,run_stats.org_run_count,run_stats.active_count,
      run_stats.user_run_reset_at,run_stats.org_run_reset_at`, [orgId, userId]);
  if (!result.rows[0]) return null;
  const row = result.rows[0];
  const configured = row.configured === null ? null : Number(row.configured);
  const effective = deploymentCeilingMicrousd === null ? null : Math.min(configured ?? deploymentCeilingMicrousd, deploymentCeilingMicrousd);
  const legacy = await getUnlinkedUsageCost(orgId, row.start_at);
  const measured = Number(row.measured) + legacy.microusd, reserved = Number(row.reserved), unknown = Number(row.unknown_reserved);
  const remaining = effective === null ? null : Math.max(0, effective - measured - reserved - unknown);
  const minimum = maxAgentReservationMicrousd('claude-opus-5')!;
  const userRunsRemaining = Math.max(0, AGENT_LIMITS.userRunsPerHour - row.user_run_count);
  const orgRunsRemaining = Math.max(0, AGENT_LIMITS.orgRunsPerHour - row.org_run_count);
  const concurrentRunsRemaining = Math.max(0, AGENT_LIMITS.orgConcurrentRuns - row.active_count);
  let blockReason: string | null = null;
  if (effective !== null && (legacy.unpriced || row.unpriced_ledger_count > 0)) {
    blockReason = 'Current-month AI usage includes a model without a server-approved price ceiling.';
  } else if (effective !== null && remaining !== null && remaining < minimum) {
    blockReason = 'The remaining monthly AI budget cannot cover another conservatively reserved run.';
  } else if (userRunsRemaining === 0 || orgRunsRemaining === 0) {
    blockReason = 'The hourly AI run allowance is exhausted.';
  } else if (concurrentRunsRemaining === 0) {
    blockReason = 'All concurrent AI run slots are currently in use.';
  }
  return {
    enabled: effective !== null,
    deploymentCeilingMicrousd,
    configuredLimitMicrousd: configured,
    effectiveLimitMicrousd: effective,
    measuredMicrousd: measured,
    reservedMicrousd: reserved,
    unknownReservedMicrousd: unknown,
    remainingMicrousd: remaining,
    unknownSettlements: row.unknown_count,
    resetAt: row.reset_at.toISOString(),
    version: row.version ?? 0,
    warningPercent: row.warning_percent ?? 80,
    blockReason,
    userRunsRemaining,
    orgRunsRemaining,
    concurrentRunsRemaining,
    userRunResetAt: row.user_run_reset_at?.toISOString() ?? null,
    orgRunResetAt: row.org_run_reset_at?.toISOString() ?? null,
  };
}
