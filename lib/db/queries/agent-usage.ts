import { query, transaction } from '@/lib/db/pool';
import { estimateCostUsd } from '@/lib/agents/pricing';
import type { DateRange } from '@/lib/db/queries/analytics';
import { settleMeasuredAgentBudget } from './agent-budget';

export type AgentName = 'intake' | 'assessment' | 'output' | 'security';

export interface AgentUsageInsert {
  agentRunId?: string;
  organizationId: string;
  requestId: string | null;
  userId: string | null;
  agent: AgentName;
  model: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  steps: number;
  finishReason: string | null;
}

export async function recordAgentUsage(row: AgentUsageInsert): Promise<void> {
  await transaction(async () => {
    await query(
    `INSERT INTO agent_usage (
       agent_run_id, organization_id, request_id, user_id, agent, model,
       input_tokens, output_tokens, duration_ms, steps, finish_reason
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      row.agentRunId ?? null,
      row.organizationId,
      row.requestId,
      row.userId,
      row.agent,
      row.model,
      row.inputTokens,
      row.outputTokens,
      row.durationMs,
      row.steps,
      row.finishReason,
    ]
    );
    if (row.agentRunId) {
      await settleMeasuredAgentBudget({
        runId: row.agentRunId,
        model: row.model,
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
      });
    }
  });
}

export interface AgentUsageSummaryRow {
  agent: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  avgDurationMs: number;
}

export interface AgentUsageSummary {
  rows: AgentUsageSummaryRow[];
  total: AgentUsageSummaryRow;
}

interface Accumulator {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  costUsd: number;
}

function emptyAccumulator(): Accumulator {
  return {
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    durationMs: 0,
    costUsd: 0,
  };
}

function toSummaryRow(agent: string, acc: Accumulator): AgentUsageSummaryRow {
  return {
    agent,
    calls: acc.calls,
    inputTokens: acc.inputTokens,
    outputTokens: acc.outputTokens,
    estimatedCostUsd: acc.costUsd,
    avgDurationMs: acc.calls > 0 ? Math.round(acc.durationMs / acc.calls) : 0,
  };
}

export async function getAgentUsageSummary(
  orgId: string,
  dateRange?: DateRange
): Promise<AgentUsageSummary> {
  const params: unknown[] = [orgId];
  let dateFilter = '';
  if (dateRange) {
    dateFilter = ` AND created_at >= $2 AND created_at <= $3`;
    params.push(dateRange.from, dateRange.to);
  }

  // Grouped by model as well as agent: pricing is per model, and cost is
  // computed in TS so the rate table stays in one place.
  const result = await query(
    `SELECT agent,
            model,
            COUNT(*) AS calls,
            SUM(input_tokens) AS input_tokens,
            SUM(output_tokens) AS output_tokens,
            SUM(duration_ms) AS duration_ms
     FROM agent_usage
     WHERE organization_id = $1${dateFilter}
     GROUP BY agent, model
     ORDER BY agent ASC`,
    params
  );

  const byAgent = new Map<string, Accumulator>();
  const total = emptyAccumulator();

  for (const row of result.rows) {
    const calls = parseInt(row.calls, 10);
    const inputTokens = parseInt(row.input_tokens, 10);
    const outputTokens = parseInt(row.output_tokens, 10);
    const durationMs = parseInt(row.duration_ms, 10);
    const costUsd = estimateCostUsd(row.model, inputTokens, outputTokens);

    const acc = byAgent.get(row.agent) ?? emptyAccumulator();
    acc.calls += calls;
    acc.inputTokens += inputTokens;
    acc.outputTokens += outputTokens;
    acc.durationMs += durationMs;
    acc.costUsd += costUsd;
    byAgent.set(row.agent, acc);

    total.calls += calls;
    total.inputTokens += inputTokens;
    total.outputTokens += outputTokens;
    total.durationMs += durationMs;
    total.costUsd += costUsd;
  }

  return {
    rows: [...byAgent.entries()].map(([agent, acc]) =>
      toSummaryRow(agent, acc)
    ),
    total: toSummaryRow('total', total),
  };
}
