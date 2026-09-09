import { describe, expect, it } from 'vitest';
import { scoringConfigSchema, calculatePolicyScore } from './scoring-policy';
import { defaultScoringConfig } from './scoring';
describe('validated scoring policy', () => {
  it.each([
    { ...defaultScoringConfig, weights: { business: 1, technical: 1, risk: 1 } },
    { ...defaultScoringConfig, thresholds: { highPriority: 40, mediumPriority: 50 } },
    { ...defaultScoringConfig, thresholds: { highPriority: Infinity, mediumPriority: 50 } },
    { ...defaultScoringConfig, weights: { business: -0.1, technical: 0.5, risk: 0.6 } },
  ])('rejects invalid totals, ranges, or thresholds', config => { expect(scoringConfigSchema.safeParse(config).success).toBe(false); });
  it('uses framework inputs for RICE and WSJF and dimension weights for Custom', () => {
    const dimensions = { businessScore: 80, technicalScore: 70, riskScore: 30 };
    expect(calculatePolicyScore(defaultScoringConfig, dimensions, { reach: 7, impact: 3, confidence: 90, effort: 4 })).toBe(47);
    expect(calculatePolicyScore({ ...defaultScoringConfig, framework: 'WSJF' }, dimensions, { businessValue: 8, timeCriticality: 5, riskReduction: 3, jobSize: 4 })).toBe(40);
    expect(calculatePolicyScore({ ...defaultScoringConfig, framework: 'CUSTOM' }, dimensions, {})).toBe(74);
    expect(() => calculatePolicyScore(defaultScoringConfig, dimensions, { reach: 1, impact: 1, confidence: 100, effort: 0 })).toThrow();
    expect(() => calculatePolicyScore(defaultScoringConfig, dimensions, {})).toThrow();
  });
});
