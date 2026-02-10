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
