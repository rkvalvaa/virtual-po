import { z } from 'zod';
import { calculateRICE, calculateWSJF, calculateWeightedScore, defaultScoringConfig, type ScoringConfig } from './scoring';

const score = z.number().min(0).max(100);
export const scoringConfigSchema = z.object({
  framework: z.enum(['RICE', 'WSJF', 'CUSTOM']),
  weights: z.object({ business: z.number().min(0).max(1), technical: z.number().min(0).max(1), risk: z.number().min(0).max(1) })
    .refine(w => Math.abs(w.business + w.technical + w.risk - 1) < 0.000001, 'Weights must total 100%.'),
  thresholds: z.object({ highPriority: score, mediumPriority: score }).refine(t => t.highPriority > t.mediumPriority, 'High priority must exceed medium priority.'),
});
export interface ScoringPolicy { version: number; config: ScoringConfig }
export const riceInputsSchema = z.object({ reach: z.number().min(0).max(1_000_000), impact: z.number().min(0).max(3), confidence: score, effort: z.number().min(0.01).max(10000) });
export const wsjfInputsSchema = z.object({ businessValue: z.number().min(0).max(10), timeCriticality: z.number().min(0).max(10), riskReduction: z.number().min(0).max(10), jobSize: z.number().min(0.01).max(10000) });

export function calculatePolicyScore(config: ScoringConfig, dimensions: { businessScore: number; technicalScore: number; riskScore: number }, inputs: unknown): number {
  scoringConfigSchema.parse(config);
  z.object({ businessScore: score, technicalScore: score, riskScore: score }).parse(dimensions);
  const raw = config.framework === 'RICE' ? calculateRICE(riceInputsSchema.parse(inputs))
    : config.framework === 'WSJF' ? calculateWSJF(wsjfInputsSchema.parse(inputs))
    : calculateWeightedScore(dimensions.businessScore, dimensions.technicalScore, dimensions.riskScore, config);
  return Math.min(100, Math.max(0, raw));
}

/** Historical requests without a snapshot retain the original 75/50 labels. */
export function assessmentScoringPolicy(data: Record<string, unknown> | null | undefined): ScoringPolicy {
  const parsed = z.object({ version: z.number().int().nonnegative(), config: scoringConfigSchema }).safeParse(data?.scoringPolicy);
  return parsed.success ? parsed.data : { version: 0, config: defaultScoringConfig };
}
