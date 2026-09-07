import { describe, it, expect } from 'vitest'
import { estimateCostUsd, MODEL_PRICING_USD_PER_MTOK } from './pricing'

const SONNET = 'claude-sonnet-4-5-20250929'

describe('estimateCostUsd', () => {
  it('should price one million input tokens at the table rate', () => {
    expect(estimateCostUsd(SONNET, 1_000_000, 0)).toBe(3)
  })

  it('should price one million output tokens at the table rate', () => {
    expect(estimateCostUsd(SONNET, 0, 1_000_000)).toBe(15)
  })

  it('should sum input and output cost', () => {
    // 500k input @ $3/MTok = $1.50, 200k output @ $15/MTok = $3.00
    expect(estimateCostUsd(SONNET, 500_000, 200_000)).toBeCloseTo(4.5, 10)
  })

  it('should return zero for zero tokens', () => {
    expect(estimateCostUsd(SONNET, 0, 0)).toBe(0)
  })

  it('should fall back to Sonnet rates for an unknown model', () => {
    expect(estimateCostUsd('some-future-model', 1_000_000, 1_000_000)).toBe(18)
  })

  it('should list Sonnet 4.5 at $3/$15 per MTok', () => {
    expect(MODEL_PRICING_USD_PER_MTOK[SONNET]).toEqual({ input: 3, output: 15 })
  })
})
