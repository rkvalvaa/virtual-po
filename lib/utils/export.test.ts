import { describe, it, expect } from 'vitest'
import { generateCSV, formatRequestsForExport } from './export'
import type { FeatureRequest } from '@/lib/types/database'

function makeRequest(overrides: Partial<FeatureRequest> = {}): FeatureRequest {
  return {
    id: 'req-1',
    organizationId: 'org-1',
    requesterId: 'user-1',
    assigneeId: null,
    title: 'Add dark mode',
    summary: null,
    status: 'UNDER_REVIEW',
    intakeData: {},
    intakeComplete: true,
    qualityScore: 80,
    assessmentData: null,
    businessScore: 70,
    technicalScore: 60,
    riskScore: 30,
    priorityScore: 75,
    complexity: 'M',
    tags: ['ui', 'a11y'],
    externalId: null,
    externalUrl: null,
    actualComplexity: null,
    actualEffortDays: null,
    lessonsLearned: null,
    jiraIssueKey: null,
    jiraIssueUrl: null,
    linearIssueId: null,
    linearIssueUrl: null,
    githubIssueNumber: null,
    githubIssueUrl: null,
    createdAt: new Date('2026-01-15T10:00:00Z'),
    updatedAt: new Date('2026-02-01T12:30:00Z'),
    ...overrides,
  }
}

describe('generateCSV', () => {
  it('should generate a CSV with headers and rows', () => {
    const csv = generateCSV(
      ['Name', 'Age'],
      [
        ['Alice', '30'],
        ['Bob', '25'],
      ],
    )
    expect(csv).toBe('Name,Age\r\nAlice,30\r\nBob,25')
  })

  it('should generate header-only CSV when rows is empty', () => {
    const csv = generateCSV(['A', 'B'], [])
    expect(csv).toBe('A,B')
  })

  it('should quote cells containing commas', () => {
    const csv = generateCSV(['Title'], [['Hello, world']])
    expect(csv).toBe('Title\r\n"Hello, world"')
  })

  it('should quote cells containing double quotes and escape them by doubling', () => {
    const csv = generateCSV(['Quote'], [['She said "hi"']])
    expect(csv).toBe('Quote\r\n"She said ""hi"""')
  })

  it('should quote cells containing newlines', () => {
    const csv = generateCSV(['Text'], [['line1\nline2']])
    expect(csv).toBe('Text\r\n"line1\nline2"')
  })

  it('should quote cells containing carriage returns', () => {
    const csv = generateCSV(['Text'], [['line1\r\nline2']])
    expect(csv).toBe('Text\r\n"line1\r\nline2"')
  })

  it('should not quote cells without special characters', () => {
    const csv = generateCSV(['Title'], [['plain text']])
    expect(csv).toBe('Title\r\nplain text')
  })

  it('should preserve empty cells without quoting', () => {
    const csv = generateCSV(['A', 'B'], [['', 'value']])
    expect(csv).toBe('A,B\r\n,value')
  })

  it('should use CRLF line separators', () => {
    const csv = generateCSV(['A'], [['1'], ['2'], ['3']])
    expect(csv).toBe('A\r\n1\r\n2\r\n3')
  })

  it('should escape header cells the same way as data cells', () => {
    const csv = generateCSV(['Has, comma'], [['ok']])
    expect(csv).toBe('"Has, comma"\r\nok')
  })
})

describe('formatRequestsForExport', () => {
  it('should produce the expected header row', () => {
    const { headers } = formatRequestsForExport([])
    expect(headers).toEqual([
      'Title',
      'Status',
      'Priority Score',
      'Quality Score',
      'Complexity',
      'Tags',
      'Created At',
      'Updated At',
    ])
  })

  it('should format a complete request into a row', () => {
    const { rows } = formatRequestsForExport([makeRequest()])
    expect(rows[0]).toEqual([
      'Add dark mode',
      'UNDER_REVIEW',
      '75',
      '80',
      'M',
      'ui; a11y',
      '2026-01-15T10:00:00.000Z',
      '2026-02-01T12:30:00.000Z',
    ])
  })

  it('should render null scores as empty strings', () => {
    const req = makeRequest({ priorityScore: null, qualityScore: null })
    const { rows } = formatRequestsForExport([req])
    expect(rows[0][2]).toBe('')
    expect(rows[0][3]).toBe('')
  })

  it('should render null complexity as empty string', () => {
    const req = makeRequest({ complexity: null })
    const { rows } = formatRequestsForExport([req])
    expect(rows[0][4]).toBe('')
  })

  it('should render empty tags array as empty string', () => {
    const req = makeRequest({ tags: [] })
    const { rows } = formatRequestsForExport([req])
    expect(rows[0][5]).toBe('')
  })

  it('should join multiple tags with semicolon-space', () => {
    const req = makeRequest({ tags: ['one', 'two', 'three'] })
    const { rows } = formatRequestsForExport([req])
    expect(rows[0][5]).toBe('one; two; three')
  })

  it('should return one row per request, preserving order', () => {
    const reqs = [
      makeRequest({ id: 'a', title: 'A' }),
      makeRequest({ id: 'b', title: 'B' }),
      makeRequest({ id: 'c', title: 'C' }),
    ]
    const { rows } = formatRequestsForExport(reqs)
    expect(rows.map((r) => r[0])).toEqual(['A', 'B', 'C'])
  })

  it('should produce a header-only export for empty input', () => {
    const { headers, rows } = formatRequestsForExport([])
    expect(headers).toHaveLength(8)
    expect(rows).toEqual([])
  })

  it('should serialize Date columns as ISO strings', () => {
    const req = makeRequest({
      createdAt: new Date('2026-03-15T08:00:00.000Z'),
      updatedAt: new Date('2026-04-01T16:45:30.500Z'),
    })
    const { rows } = formatRequestsForExport([req])
    expect(rows[0][6]).toBe('2026-03-15T08:00:00.000Z')
    expect(rows[0][7]).toBe('2026-04-01T16:45:30.500Z')
  })
})

describe('generateCSV + formatRequestsForExport (end-to-end)', () => {
  it('should round-trip a request through CSV generation safely', () => {
    const req = makeRequest({
      title: 'Title with "quotes" and, commas',
      tags: ['tag1', 'tag2'],
    })
    const { headers, rows } = formatRequestsForExport([req])
    const csv = generateCSV(headers, rows)
    expect(csv).toContain('"Title with ""quotes"" and, commas"')
    expect(csv).toContain('tag1; tag2')
  })
})
