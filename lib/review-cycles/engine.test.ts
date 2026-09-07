import { describe, it, expect } from 'vitest'
import { isCycleDue } from './engine'
import {
  parseReviewCycleConfig,
  DEFAULT_REVIEW_CYCLE_CONFIG,
  type ReviewCycleConfig,
} from './config'

// 2026-09-07 is a Monday (UTC). Every date below is UTC on purpose — the
// schedule must not shift with the server's timezone.
const MONDAY = new Date('2026-09-07T06:00:00Z')

const weekly: ReviewCycleConfig = {
  enabled: true,
  cadence: 'WEEKLY',
  dayOfWeek: 1,
}

const monthly: ReviewCycleConfig = {
  enabled: true,
  cadence: 'MONTHLY',
  dayOfWeek: 1,
  dayOfMonth: 7,
}

describe('isCycleDue', () => {
  it('should be due on the configured weekday when no cycle has ever run', () => {
    expect(isCycleDue(weekly, MONDAY, null)).toBe(true)
  })

  it('should not be due when the config is disabled', () => {
    expect(isCycleDue({ ...weekly, enabled: false }, MONDAY, null)).toBe(false)
  })

  it('should not be due on a day that is not the configured weekday', () => {
    const tuesday = new Date('2026-09-08T06:00:00Z')
    expect(isCycleDue(weekly, tuesday, null)).toBe(false)
  })

  it('should not be due twice on the same day', () => {
    const earlierToday = new Date('2026-09-07T01:00:00Z')
    expect(isCycleDue(weekly, MONDAY, earlierToday)).toBe(false)
  })

  it('should be due again a week after the last run', () => {
    const lastWeek = new Date('2026-08-31T06:00:00Z')
    expect(isCycleDue(weekly, MONDAY, lastWeek)).toBe(true)
  })

  it('should read the weekday in UTC, not local time', () => {
    // Late Sunday UTC — local time east of UTC would already call this Monday.
    const lateSunday = new Date('2026-09-06T23:30:00Z')
    expect(isCycleDue(weekly, lateSunday, null)).toBe(false)
  })

  it('should honour a non-default weekday', () => {
    const friday = new Date('2026-09-11T06:00:00Z')
    expect(isCycleDue({ ...weekly, dayOfWeek: 5 }, friday, null)).toBe(true)
    expect(isCycleDue({ ...weekly, dayOfWeek: 5 }, MONDAY, null)).toBe(false)
  })

  it('should be due monthly on the configured day of month', () => {
    expect(isCycleDue(monthly, MONDAY, null)).toBe(true)
  })

  it('should not be due monthly on another day of the month', () => {
    const eighth = new Date('2026-09-08T06:00:00Z')
    expect(isCycleDue(monthly, eighth, null)).toBe(false)
  })

  it('should not run a monthly cycle twice in the same month', () => {
    const earlierToday = new Date('2026-09-07T01:00:00Z')
    expect(isCycleDue(monthly, MONDAY, earlierToday)).toBe(false)
  })

  it('should be due monthly once the previous month has passed', () => {
    const lastMonth = new Date('2026-08-07T06:00:00Z')
    expect(isCycleDue(monthly, MONDAY, lastMonth)).toBe(true)
  })

  it('should default a monthly cycle with no dayOfMonth to the 1st', () => {
    const config: ReviewCycleConfig = {
      enabled: true,
      cadence: 'MONTHLY',
      dayOfWeek: 1,
    }
    expect(isCycleDue(config, new Date('2026-09-01T06:00:00Z'), null)).toBe(true)
    expect(isCycleDue(config, MONDAY, null)).toBe(false)
  })
})

describe('parseReviewCycleConfig', () => {
  it('should return the disabled default for settings without a reviewCycle key', () => {
    expect(parseReviewCycleConfig({ scoring: {} })).toEqual(
      DEFAULT_REVIEW_CYCLE_CONFIG
    )
  })

  it('should return the default for null and undefined settings', () => {
    expect(parseReviewCycleConfig(null)).toEqual(DEFAULT_REVIEW_CYCLE_CONFIG)
    expect(parseReviewCycleConfig(undefined)).toEqual(DEFAULT_REVIEW_CYCLE_CONFIG)
  })

  it('should parse a valid weekly config', () => {
    const settings = {
      reviewCycle: { enabled: true, cadence: 'WEEKLY', dayOfWeek: 3 },
    }
    expect(parseReviewCycleConfig(settings)).toEqual({
      enabled: true,
      cadence: 'WEEKLY',
      dayOfWeek: 3,
    })
  })

  it('should default dayOfWeek to Monday when it is omitted', () => {
    const settings = { reviewCycle: { enabled: true, cadence: 'WEEKLY' } }
    expect(parseReviewCycleConfig(settings).dayOfWeek).toBe(1)
  })

  it('should fall back to the default for an unknown cadence', () => {
    const settings = { reviewCycle: { enabled: true, cadence: 'DAILY' } }
    expect(parseReviewCycleConfig(settings)).toEqual(DEFAULT_REVIEW_CYCLE_CONFIG)
  })

  it('should fall back to the default for an out-of-range dayOfMonth', () => {
    const settings = {
      reviewCycle: { enabled: true, cadence: 'MONTHLY', dayOfMonth: 31 },
    }
    expect(parseReviewCycleConfig(settings)).toEqual(DEFAULT_REVIEW_CYCLE_CONFIG)
  })

  it('should fall back to the default when reviewCycle is not an object', () => {
    expect(parseReviewCycleConfig({ reviewCycle: 'weekly' })).toEqual(
      DEFAULT_REVIEW_CYCLE_CONFIG
    )
  })

  it('should never enable a cycle from a malformed blob', () => {
    expect(parseReviewCycleConfig({ reviewCycle: { enabled: 'yes' } }).enabled).toBe(
      false
    )
  })
})
