export interface ScoringConfig {
  framework: 'RICE' | 'WSJF' | 'CUSTOM';
  weights: {
    business: number;
    technical: number;
    risk: number;
  };
  thresholds: {
    highPriority: number;
    mediumPriority: number;
  };
}

export const defaultScoringConfig: ScoringConfig = {
  framework: 'RICE',
  weights: {
    business: 0.4,
    technical: 0.3,
    risk: 0.3,
  },
  thresholds: {
    highPriority: 75,
    mediumPriority: 50,
  },
};

export interface RICEInput {
  reach: number;
  impact: number;
  confidence: number;
  effort: number;
}

export interface WSJFInput {
  businessValue: number;
  timeCriticality: number;
  riskReduction: number;
  jobSize: number;
}

export function calculateRICE(input: RICEInput): number {
  return Math.round((input.reach * input.impact * (input.confidence / 100)) / input.effort * 10);
}

export function calculateWSJF(input: WSJFInput): number {
  return Math.round(((input.businessValue + input.timeCriticality + input.riskReduction) / input.jobSize) * 10);
}

export function calculateWeightedScore(
  businessScore: number,
  technicalScore: number,
  riskScore: number,
  config: ScoringConfig = defaultScoringConfig
): number {
  const invertedRisk = 100 - riskScore;
  return Math.round(
    businessScore * config.weights.business +
    technicalScore * config.weights.technical +
    invertedRisk * config.weights.risk
  );
}

export function getPriorityLabel(
  score: number,
  config: ScoringConfig = defaultScoringConfig
): 'High' | 'Medium' | 'Low' {
  if (score >= config.thresholds.highPriority) return 'High';
  if (score >= config.thresholds.mediumPriority) return 'Medium';
  return 'Low';
}
