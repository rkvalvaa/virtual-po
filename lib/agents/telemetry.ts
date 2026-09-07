import type { StreamTextOnFinishCallback, ToolSet } from 'ai';
import { recordAgentUsage, type AgentName } from '@/lib/db/queries/agent-usage';
import { log } from '@/lib/logging/logger';

interface AgentTelemetryParams {
  agent: AgentName;
  model: string;
  orgId: string;
  requestId: string | null;
  userId: string | null;
}

/**
 * Build an `onFinish` handler for `streamText` that records one `agent_usage`
 * row per agent call. Duration is measured from the moment this is created,
 * which is immediately before the `streamText` call in every route.
 */
export function createAgentTelemetry<TOOLS extends ToolSet = ToolSet>({
  agent,
  model,
  orgId,
  requestId,
  userId,
}: AgentTelemetryParams): StreamTextOnFinishCallback<TOOLS> {
  const startedAt = Date.now();

  return async (event) => {
    const durationMs = Date.now() - startedAt;
    // v6 sums usage across steps in `totalUsage`; both counts are optional.
    const inputTokens = event.totalUsage.inputTokens ?? 0;
    const outputTokens = event.totalUsage.outputTokens ?? 0;
    const steps = event.steps.length;
    const finishReason = event.finishReason;

    log.info('agent.finish', {
      agent,
      model,
      orgId,
      requestId,
      inputTokens,
      outputTokens,
      steps,
      durationMs,
      finishReason,
    });

    try {
      await recordAgentUsage({
        organizationId: orgId,
        requestId,
        userId,
        agent,
        model,
        inputTokens,
        outputTokens,
        durationMs,
        steps,
        finishReason,
      });
    } catch (err) {
      // Telemetry must never break the stream the user is reading.
      log.error('agent.usage_record_failed', { agent, requestId, err });
    }
  };
}
