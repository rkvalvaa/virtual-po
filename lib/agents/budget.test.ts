import { describe, expect, it } from 'vitest';
import { tool } from 'ai';
import { z } from 'zod';
import { AGENT_LIMITS } from './limits';
import {
  deploymentBudgetCeilingMicrousd,
  maxAgentReservationMicrousd,
  maxAgentTokenReservation,
  assertAgentToolsWithinBudget,
} from './budget';

describe('agent budget bounds', () => {
  it('reserves every allowed step with bounded repeated context and output', () => {
    expect(maxAgentTokenReservation()).toEqual({
      inputTokens: (AGENT_LIMITS.inputBytes + AGENT_LIMITS.toolSchemaBytes + AGENT_LIMITS.protocolOverheadBytesPerStep) * AGENT_LIMITS.steps,
      outputTokens: AGENT_LIMITS.outputTokensPerStep * AGENT_LIMITS.steps,
    });
    expect(maxAgentReservationMicrousd('claude-opus-5')).toBe(8_704_000);
  });

  it('rejects unknown model pricing for a hard budget', () => {
    expect(maxAgentReservationMicrousd('unknown-model')).toBeNull();
  });

  it('rejects tool definitions beyond the reserved schema bound before admission', () => {
    expect(() => assertAgentToolsWithinBudget({ oversized: tool({
      description: 'x'.repeat(AGENT_LIMITS.toolSchemaBytes + 1),
      inputSchema: z.object({ value: z.string() }),
    }) })).toThrow(/tool schemas/i);
  });

  it('distinguishes an absent ceiling from invalid fail-closed configuration', () => {
    expect(deploymentBudgetCeilingMicrousd({ AI_BUDGET_MAX_MONTHLY_USD: '12.50' })).toBe(12_500_000);
    expect(deploymentBudgetCeilingMicrousd({})).toBeNull();
    expect(() => deploymentBudgetCeilingMicrousd({ AI_BUDGET_MAX_MONTHLY_USD: '0' })).toThrow(/invalid/i);
    expect(() => deploymentBudgetCeilingMicrousd({ AI_BUDGET_MAX_MONTHLY_USD: 'not-money' })).toThrow(/invalid/i);
  });
});
