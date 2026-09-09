import { AGENT_LIMITS } from './limits';
import { MODEL_PRICING_USD_PER_MTOK } from './pricing';
import { asSchema, type ToolSet } from 'ai';

export function maxAgentTokenReservation() {
  return {
    // One UTF-8 byte per token is deliberately conservative. The reservation
    // covers the bounded conversation again at every step, plus tool schemas
    // and a fixed envelope for provider protocol/framing fields.
    inputTokens: (AGENT_LIMITS.inputBytes + AGENT_LIMITS.toolSchemaBytes +
      AGENT_LIMITS.protocolOverheadBytesPerStep) * AGENT_LIMITS.steps,
    outputTokens: AGENT_LIMITS.outputTokensPerStep * AGENT_LIMITS.steps,
  };
}

export function maxAgentReservationMicrousd(model: string): number | null {
  const pricing = MODEL_PRICING_USD_PER_MTOK[model];
  if (!pricing) return null;
  const tokens = maxAgentTokenReservation();
  return tokens.inputTokens * pricing.input + tokens.outputTokens * pricing.output;
}

export function measuredCostMicrousd(model: string, inputTokens: number, outputTokens: number): number | null {
  const pricing = MODEL_PRICING_USD_PER_MTOK[model];
  if (!pricing) return null;
  return Math.ceil(inputTokens * pricing.input + outputTokens * pricing.output);
}

export function deploymentBudgetCeilingMicrousd(
  env: Record<string, string | undefined> = process.env,
): number | null {
  const value = env.AI_BUDGET_MAX_MONTHLY_USD?.trim();
  if (!value) return null;
  if (!/^\d+(?:\.\d{1,6})?$/.test(value)) throw new Error('Invalid AI budget deployment ceiling.');
  const microusd = Math.round(Number(value) * 1_000_000);
  if (!Number.isSafeInteger(microusd) || microusd <= 0) throw new Error('Invalid AI budget deployment ceiling.');
  return microusd;
}

export function assertAgentToolsWithinBudget(tools: ToolSet): void {
  const schemas = Object.entries(tools).map(([name, definition]) => {
    if (!('inputSchema' in definition)) return { name, providerTool: true };
    return {
      name,
      description: definition.description,
      inputSchema: asSchema(definition.inputSchema).jsonSchema,
    };
  });
  if (Buffer.byteLength(JSON.stringify(schemas), 'utf8') > AGENT_LIMITS.toolSchemaBytes) {
    throw new Error('Agent tool schemas exceed the server budget bound.');
  }
}
