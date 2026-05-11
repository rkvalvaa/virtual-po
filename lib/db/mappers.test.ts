import { describe, it, expect } from 'vitest'
import { mapRow, mapRows } from './mappers'

describe('mapRow', () => {
  it('should convert single snake_case key to camelCase', () => {
    const result = mapRow<{ firstName: string }>({ first_name: 'Alice' })
    expect(result).toEqual({ firstName: 'Alice' })
  })

  it('should convert multiple snake_case keys', () => {
    const result = mapRow<{ firstName: string; lastName: string; emailAddress: string }>({
      first_name: 'Alice',
      last_name: 'Smith',
      email_address: 'a@example.com',
    })
    expect(result).toEqual({
      firstName: 'Alice',
      lastName: 'Smith',
      emailAddress: 'a@example.com',
    })
  })

  it('should leave single-word keys unchanged', () => {
    const result = mapRow<{ id: string; name: string }>({ id: '1', name: 'Alice' })
    expect(result).toEqual({ id: '1', name: 'Alice' })
  })

  it('should handle keys with multiple underscores', () => {
    const result = mapRow<{ veryLongColumnName: number }>({
      very_long_column_name: 42,
    })
    expect(result).toEqual({ veryLongColumnName: 42 })
  })

  it('should preserve null values', () => {
    const result = mapRow<{ deletedAt: null }>({ deleted_at: null })
    expect(result).toEqual({ deletedAt: null })
  })

  it('should preserve Date values without conversion', () => {
    const date = new Date('2026-01-01T00:00:00Z')
    const result = mapRow<{ createdAt: Date }>({ created_at: date })
    expect(result.createdAt).toBe(date)
  })

  it('should preserve numeric values', () => {
    const result = mapRow<{ priorityScore: number }>({ priority_score: 85 })
    expect(result.priorityScore).toBe(85)
  })

  it('should preserve boolean values', () => {
    const result = mapRow<{ isActive: boolean }>({ is_active: true })
    expect(result.isActive).toBe(true)
  })

  it('should preserve array values', () => {
    const result = mapRow<{ tags: string[] }>({ tags: ['a', 'b', 'c'] })
    expect(result.tags).toEqual(['a', 'b', 'c'])
  })

  it('should preserve object values without recursion', () => {
    const nested = { nested_key: 'value' }
    const result = mapRow<{ intakeData: typeof nested }>({ intake_data: nested })
    expect(result.intakeData).toEqual(nested)
  })

  it('should handle empty rows', () => {
    const result = mapRow<Record<string, never>>({})
    expect(result).toEqual({})
  })

  it('should not mutate the input row', () => {
    const input = { first_name: 'Alice' }
    const inputCopy = { ...input }
    mapRow(input)
    expect(input).toEqual(inputCopy)
  })
})

describe('mapRows', () => {
  it('should map an array of rows', () => {
    const rows = [
      { first_name: 'Alice', last_name: 'Smith' },
      { first_name: 'Bob', last_name: 'Jones' },
    ]
    const result = mapRows<{ firstName: string; lastName: string }>(rows)
    expect(result).toEqual([
      { firstName: 'Alice', lastName: 'Smith' },
      { firstName: 'Bob', lastName: 'Jones' },
    ])
  })

  it('should return empty array for empty input', () => {
    const result = mapRows([])
    expect(result).toEqual([])
  })

  it('should preserve row order', () => {
    const rows = [
      { id: '1' },
      { id: '2' },
      { id: '3' },
    ]
    const result = mapRows<{ id: string }>(rows)
    expect(result.map((r) => r.id)).toEqual(['1', '2', '3'])
  })
})
