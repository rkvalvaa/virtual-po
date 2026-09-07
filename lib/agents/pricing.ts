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
 * added; unknown models fall back to Sonnet rates so cost is never zero.
 */
export const MODEL_PRICING_USD_PER_MTOK: Record<string, ModelPricing> = {
  'claude-sonnet-4-5-20250929': { input: 3, output: 15 },
};

const FALLBACK_PRICING: ModelPricing = { input: 3, output: 15 };

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
