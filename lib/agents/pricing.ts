export interface ModelPricing {
  /** USD per million input tokens. */
  input: number;
  /** USD per million output tokens. */
  output: number;
}

/**
 * Anthropic list pricing, USD per million tokens.
 *
 * ponytail: a flat map, not a pricing service. Add a row when a model is
 * added; unknown models fall back to the current agent model's rates so
 * cost is never zero. Historical rows stay so old agent_usage rows price
 * correctly.
 */
export const MODEL_PRICING_USD_PER_MTOK: Record<string, ModelPricing> = {
  'claude-opus-5': { input: 5, output: 25 },
  'claude-sonnet-4-5-20250929': { input: 3, output: 15 },
};

const FALLBACK_PRICING: ModelPricing = MODEL_PRICING_USD_PER_MTOK['claude-opus-5'];

export function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const pricing = MODEL_PRICING_USD_PER_MTOK[model] ?? FALLBACK_PRICING;
  return (
    (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000
  );
}
