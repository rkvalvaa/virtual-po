import { describe, it, expect } from 'vitest'
import {
  calculateRICE,
  calculateWSJF,
  calculateWeightedScore,
  getPriorityLabel,
} from './scoring'
import type { ScoringConfig } from './scoring'

describe('calculateRICE', () => {
  it('should calculate RICE score with standard inputs', () => {
    // (10 * 3 * (80/100)) / 2 * 10 = (10 * 3 * 0.8) / 2 * 10 = 24 / 2 * 10 = 120
    expect(calculateRICE({ reach: 10, impact: 3, confidence: 80, effort: 2 })).toBe(120)
  })

  it('should calculate RICE score with 100% confidence', () => {
    // (5 * 2 * (100/100)) / 1 * 10 = 10 / 1 * 10 = 100
    expect(calculateRICE({ reach: 5, impact: 2, confidence: 100, effort: 1 })).toBe(100)
  })

  it('should return lower score with low confidence', () => {
    // (10 * 3 * (20/100)) / 2 * 10 = (10 * 3 * 0.2) / 2 * 10 = 6 / 2 * 10 = 30
    expect(calculateRICE({ reach: 10, impact: 3, confidence: 20, effort: 2 })).toBe(30)
  })

  it('should return lower score with high effort', () => {
    // (10 * 3 * (80/100)) / 10 * 10 = 24 / 10 * 10 = 24
    expect(calculateRICE({ reach: 10, impact: 3, confidence: 80, effort: 10 })).toBe(24)
  })

  it('should return 0 when reach is 0', () => {
    expect(calculateRICE({ reach: 0, impact: 3, confidence: 80, effort: 2 })).toBe(0)
  })

  it('should return 0 when impact is 0', () => {
    expect(calculateRICE({ reach: 10, impact: 0, confidence: 80, effort: 2 })).toBe(0)
  })

  it('should return 0 when confidence is 0', () => {
    expect(calculateRICE({ reach: 10, impact: 3, confidence: 0, effort: 2 })).toBe(0)
  })

  it('should handle fractional results by rounding', () => {
    // (7 * 3 * (90/100)) / 4 * 10 = (7 * 3 * 0.9) / 4 * 10 = 18.9 / 4 * 10 = 47.25 -> 47
    expect(calculateRICE({ reach: 7, impact: 3, confidence: 90, effort: 4 })).toBe(47)
  })
})

describe('calculateWSJF', () => {
  it('should calculate WSJF score with standard inputs', () => {
    // ((8 + 5 + 3) / 4) * 10 = (16 / 4) * 10 = 40
    expect(calculateWSJF({ businessValue: 8, timeCriticality: 5, riskReduction: 3, jobSize: 4 })).toBe(40)
  })

  it('should return higher score for small job size', () => {
    // ((8 + 5 + 3) / 1) * 10 = 160
    expect(calculateWSJF({ businessValue: 8, timeCriticality: 5, riskReduction: 3, jobSize: 1 })).toBe(160)
  })

  it('should return lower score for large job size', () => {
    // ((8 + 5 + 3) / 10) * 10 = 16
    expect(calculateWSJF({ businessValue: 8, timeCriticality: 5, riskReduction: 3, jobSize: 10 })).toBe(16)
  })

  it('should return 0 when all value inputs are 0', () => {
    // ((0 + 0 + 0) / 5) * 10 = 0
    expect(calculateWSJF({ businessValue: 0, timeCriticality: 0, riskReduction: 0, jobSize: 5 })).toBe(0)
  })

  it('should handle fractional results by rounding', () => {
    // ((7 + 4 + 2) / 3) * 10 = (13/3) * 10 = 43.333... -> 43
    expect(calculateWSJF({ businessValue: 7, timeCriticality: 4, riskReduction: 2, jobSize: 3 })).toBe(43)
  })

  it('should handle high value components', () => {
    // ((10 + 10 + 10) / 1) * 10 = 300
    expect(calculateWSJF({ businessValue: 10, timeCriticality: 10, riskReduction: 10, jobSize: 1 })).toBe(300)
  })
})

describe('calculateWeightedScore', () => {
  it('should calculate weighted score with default config', () => {
    // business=80, technical=70, risk=30
    // invertedRisk = 100 - 30 = 70
    // 80 * 0.4 + 70 * 0.3 + 70 * 0.3 = 32 + 21 + 21 = 74
    expect(calculateWeightedScore(80, 70, 30)).toBe(74)
  })

  it('should invert risk score so lower risk gives higher weighted score', () => {
    // risk=0 -> invertedRisk=100
    // 80 * 0.4 + 70 * 0.3 + 100 * 0.3 = 32 + 21 + 30 = 83
    expect(calculateWeightedScore(80, 70, 0)).toBe(83)
  })

  it('should give lower score for high risk', () => {
    // risk=100 -> invertedRisk=0
    // 80 * 0.4 + 70 * 0.3 + 0 * 0.3 = 32 + 21 + 0 = 53
    expect(calculateWeightedScore(80, 70, 100)).toBe(53)
  })

  it('should return 0 when all scores are 0 and risk is 100', () => {
    // invertedRisk = 100 - 100 = 0
    // 0 * 0.4 + 0 * 0.3 + 0 * 0.3 = 0
    expect(calculateWeightedScore(0, 0, 100)).toBe(0)
  })

  it('should use custom config weights', () => {
    const customConfig: ScoringConfig = {
      framework: 'CUSTOM',
      weights: { business: 0.5, technical: 0.3, risk: 0.2 },
      thresholds: { highPriority: 80, mediumPriority: 60 },
    }
    // business=90, technical=60, risk=20
    // invertedRisk = 100 - 20 = 80
    // 90 * 0.5 + 60 * 0.3 + 80 * 0.2 = 45 + 18 + 16 = 79
    expect(calculateWeightedScore(90, 60, 20, customConfig)).toBe(79)
  })

  it('should round the result', () => {
    // business=75, technical=65, risk=45
    // invertedRisk = 100 - 45 = 55
    // 75 * 0.4 + 65 * 0.3 + 55 * 0.3 = 30 + 19.5 + 16.5 = 66
    expect(calculateWeightedScore(75, 65, 45)).toBe(66)
  })

  it('should return max score when all components are 100 and risk is 0', () => {
    // invertedRisk = 100 - 0 = 100
    // 100 * 0.4 + 100 * 0.3 + 100 * 0.3 = 40 + 30 + 30 = 100
    expect(calculateWeightedScore(100, 100, 0)).toBe(100)
  })
})

describe('getPriorityLabel', () => {
  it('should return High for score at high threshold (75)', () => {
    expect(getPriorityLabel(75)).toBe('High')
  })

  it('should return High for score above high threshold', () => {
    expect(getPriorityLabel(90)).toBe('High')
  })

  it('should return Medium for score at medium threshold (50)', () => {
    expect(getPriorityLabel(50)).toBe('Medium')
  })

  it('should return Medium for score between thresholds', () => {
    expect(getPriorityLabel(74)).toBe('Medium')
  })

  it('should return Low for score just below medium threshold (49)', () => {
    expect(getPriorityLabel(49)).toBe('Low')
  })

  it('should return Low for score of 0', () => {
    expect(getPriorityLabel(0)).toBe('Low')
  })

  it('should use custom thresholds', () => {
    const customConfig: ScoringConfig = {
      framework: 'CUSTOM',
      weights: { business: 0.4, technical: 0.3, risk: 0.3 },
      thresholds: { highPriority: 90, mediumPriority: 70 },
    }
    expect(getPriorityLabel(90, customConfig)).toBe('High')
    expect(getPriorityLabel(89, customConfig)).toBe('Medium')
    expect(getPriorityLabel(70, customConfig)).toBe('Medium')
    expect(getPriorityLabel(69, customConfig)).toBe('Low')
  })

  it('should return High for score of 100', () => {
    expect(getPriorityLabel(100)).toBe('High')
  })
})
