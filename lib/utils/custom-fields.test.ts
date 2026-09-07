import { describe, it, expect } from 'vitest'
import {
  slugifyFieldKey,
  validateCustomFieldValues,
  formatCustomFieldValue,
} from './custom-fields'
import type { CustomFieldDefinition, CustomFieldType } from '@/lib/types/database'

function makeDefinition(
  overrides: Partial<CustomFieldDefinition> & { name: string; type: CustomFieldType }
): CustomFieldDefinition {
  return {
    id: `def-${overrides.name}`,
    organizationId: 'org-1',
    key: slugifyFieldKey(overrides.name),
    options: [],
    required: false,
    sortOrder: 0,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  }
}

describe('slugifyFieldKey', () => {
  it('should lowercase a simple name', () => {
    expect(slugifyFieldKey('Priority')).toBe('priority')
  })

  it('should replace spaces with underscores', () => {
    expect(slugifyFieldKey('Business Unit')).toBe('business_unit')
  })

  it('should collapse runs of non-alphanumeric characters into one underscore', () => {
    expect(slugifyFieldKey('Cost / Benefit  Ratio')).toBe('cost_benefit_ratio')
  })

  it('should strip leading and trailing separators', () => {
    expect(slugifyFieldKey('  -Target Date-  ')).toBe('target_date')
  })

  it('should keep digits', () => {
    expect(slugifyFieldKey('Q3 2026 Goal')).toBe('q3_2026_goal')
  })

  it('should return an empty string when the name has no alphanumerics', () => {
    expect(slugifyFieldKey('***')).toBe('')
  })

  it('should truncate long names without leaving a trailing underscore', () => {
    // The 64-char cut lands exactly on the separator before "tail".
    const key = slugifyFieldKey('a'.repeat(63) + ' tail')
    expect(key).toBe('a'.repeat(63))
  })

  it('should be stable when applied twice', () => {
    const once = slugifyFieldKey('Business Unit')
    expect(slugifyFieldKey(once)).toBe(once)
  })
})

describe('validateCustomFieldValues', () => {
  it('should accept an empty definition list', () => {
    const result = validateCustomFieldValues([], { anything: 'ignored' })
    expect(result.ok).toBe(true)
    expect(result.values).toEqual({})
  })

  it('should drop values with no matching definition', () => {
    const def = makeDefinition({ name: 'Owner', type: 'TEXT' })
    const result = validateCustomFieldValues([def], { owner: 'Ada', stale_key: 'x' })
    expect(result.values).toEqual({ owner: 'Ada' })
  })

  it('should store an unset optional field as null', () => {
    const def = makeDefinition({ name: 'Owner', type: 'TEXT' })
    const result = validateCustomFieldValues([def], {})
    expect(result.ok).toBe(true)
    expect(result.values.owner).toBeNull()
  })

  it('should reject a required field that is missing', () => {
    const def = makeDefinition({ name: 'Owner', type: 'TEXT', required: true })
    const result = validateCustomFieldValues([def], {})
    expect(result.ok).toBe(false)
    expect(result.errors.owner).toBe('Owner is required')
  })

  it('should reject a required field submitted as whitespace only', () => {
    const def = makeDefinition({ name: 'Owner', type: 'TEXT', required: true })
    const result = validateCustomFieldValues([def], { owner: '   ' })
    expect(result.ok).toBe(false)
    expect(result.errors.owner).toBe('Owner is required')
  })

  it('should trim text values', () => {
    const def = makeDefinition({ name: 'Owner', type: 'TEXT' })
    const result = validateCustomFieldValues([def], { owner: '  Ada  ' })
    expect(result.values.owner).toBe('Ada')
  })

  it('should coerce a numeric string to a number', () => {
    const def = makeDefinition({ name: 'Est Cost', type: 'NUMBER' })
    const result = validateCustomFieldValues([def], { est_cost: '42.5' })
    expect(result.ok).toBe(true)
    expect(result.values.est_cost).toBe(42.5)
  })

  it('should accept a negative number', () => {
    const def = makeDefinition({ name: 'Est Cost', type: 'NUMBER' })
    const result = validateCustomFieldValues([def], { est_cost: '-3' })
    expect(result.values.est_cost).toBe(-3)
  })

  it('should reject a non-numeric NUMBER value', () => {
    const def = makeDefinition({ name: 'Est Cost', type: 'NUMBER' })
    const result = validateCustomFieldValues([def], { est_cost: 'lots' })
    expect(result.ok).toBe(false)
    expect(result.errors.est_cost).toBe('Est Cost must be a number')
  })

  it('should reject a non-finite NUMBER value', () => {
    const def = makeDefinition({ name: 'Est Cost', type: 'NUMBER' })
    const result = validateCustomFieldValues([def], { est_cost: 'Infinity' })
    expect(result.ok).toBe(false)
    expect(result.errors.est_cost).toBe('Est Cost must be a number')
  })

  it('should accept a SELECT value present in options', () => {
    const def = makeDefinition({
      name: 'Team',
      type: 'SELECT',
      options: ['Platform', 'Growth'],
    })
    const result = validateCustomFieldValues([def], { team: 'Growth' })
    expect(result.ok).toBe(true)
    expect(result.values.team).toBe('Growth')
  })

  it('should reject a SELECT value outside the options list', () => {
    const def = makeDefinition({
      name: 'Team',
      type: 'SELECT',
      options: ['Platform', 'Growth'],
    })
    const result = validateCustomFieldValues([def], { team: 'Billing' })
    expect(result.ok).toBe(false)
    expect(result.errors.team).toBe('Team must be one of: Platform, Growth')
  })

  it('should accept a well-formed DATE value', () => {
    const def = makeDefinition({ name: 'Target Date', type: 'DATE' })
    const result = validateCustomFieldValues([def], { target_date: '2026-09-07' })
    expect(result.ok).toBe(true)
    expect(result.values.target_date).toBe('2026-09-07')
  })

  it('should reject a DATE value in the wrong format', () => {
    const def = makeDefinition({ name: 'Target Date', type: 'DATE' })
    const result = validateCustomFieldValues([def], { target_date: '07/09/2026' })
    expect(result.ok).toBe(false)
    expect(result.errors.target_date).toBe('Target Date must be a date (YYYY-MM-DD)')
  })

  it('should reject a DATE value that overflows its month', () => {
    const def = makeDefinition({ name: 'Target Date', type: 'DATE' })
    const result = validateCustomFieldValues([def], { target_date: '2026-02-30' })
    expect(result.ok).toBe(false)
    expect(result.errors.target_date).toBe('Target Date must be a date (YYYY-MM-DD)')
  })

  it('should null out the value of a field that failed validation', () => {
    const def = makeDefinition({ name: 'Est Cost', type: 'NUMBER' })
    const result = validateCustomFieldValues([def], { est_cost: 'lots' })
    expect(result.values.est_cost).toBeNull()
  })

  it('should report every failing field at once', () => {
    const definitions = [
      makeDefinition({ name: 'Est Cost', type: 'NUMBER' }),
      makeDefinition({ name: 'Target Date', type: 'DATE' }),
      makeDefinition({ name: 'Owner', type: 'TEXT', required: true }),
    ]
    const result = validateCustomFieldValues(definitions, {
      est_cost: 'lots',
      target_date: 'soon',
    })
    expect(result.ok).toBe(false)
    expect(Object.keys(result.errors).sort()).toEqual([
      'est_cost',
      'owner',
      'target_date',
    ])
  })

  it('should keep valid siblings when one field fails', () => {
    const definitions = [
      makeDefinition({ name: 'Owner', type: 'TEXT' }),
      makeDefinition({ name: 'Est Cost', type: 'NUMBER' }),
    ]
    const result = validateCustomFieldValues(definitions, {
      owner: 'Ada',
      est_cost: 'lots',
    })
    expect(result.values.owner).toBe('Ada')
  })

  it('should accept an already-numeric value for a NUMBER field', () => {
    const def = makeDefinition({ name: 'Est Cost', type: 'NUMBER' })
    const result = validateCustomFieldValues([def], { est_cost: 7 })
    expect(result.values.est_cost).toBe(7)
  })
})

describe('formatCustomFieldValue', () => {
  it('should render null as an empty string', () => {
    expect(formatCustomFieldValue(null)).toBe('')
  })

  it('should render undefined as an empty string', () => {
    expect(formatCustomFieldValue(undefined)).toBe('')
  })

  it('should render zero as "0" rather than an empty string', () => {
    expect(formatCustomFieldValue(0)).toBe('0')
  })

  it('should render a string unchanged', () => {
    expect(formatCustomFieldValue('Platform')).toBe('Platform')
  })
})
