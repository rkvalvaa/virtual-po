import { describe, it, expect } from 'vitest'
import { generateRequestPDF, generateAnalyticsPDF, type AnalyticsPDFInput } from './pdf'
import type { FeatureRequest } from '@/lib/types/database'

function makeRequest(
  overrides: Partial<Parameters<typeof generateRequestPDF>[0]> = {},
): Parameters<typeof generateRequestPDF>[0] {
  return {
    id: 'req-1',
    title: 'Add dark mode',
    summary: 'Users want a dark UI for night-time work.',
    status: 'UNDER_REVIEW' as FeatureRequest['status'],
    priorityScore: 75,
    qualityScore: 80,
    complexity: 'M' as FeatureRequest['complexity'],
    tags: ['ui', 'a11y'],
    businessScore: 70,
    technicalScore: 60,
    riskScore: 30,
    intakeData: { problem: 'Glare at night', goal: 'Reduce eye strain' },
    assessmentData: { recommendation: 'Approve' },
    createdAt: new Date('2026-01-15T10:00:00Z'),
    updatedAt: new Date('2026-02-01T12:30:00Z'),
    ...overrides,
  }
}

function pdfHeader(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes.slice(0, 8))
}

describe('generateRequestPDF', () => {
  it('should produce a non-empty Uint8Array', () => {
    const bytes = generateRequestPDF(makeRequest())
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(bytes.length).toBeGreaterThan(500)
  })

  it('should start with the PDF magic-number header', () => {
    const bytes = generateRequestPDF(makeRequest())
    // Valid PDFs begin with "%PDF-1." per the spec.
    expect(pdfHeader(bytes).startsWith('%PDF-')).toBe(true)
  })

  it('should be valid for requests with all-null optional fields', () => {
    const bytes = generateRequestPDF(
      makeRequest({
        summary: null,
        priorityScore: null,
        qualityScore: null,
        complexity: null,
        businessScore: null,
        technicalScore: null,
        riskScore: null,
        intakeData: {},
        assessmentData: null,
        tags: [],
      }),
    )
    expect(pdfHeader(bytes).startsWith('%PDF-')).toBe(true)
    expect(bytes.length).toBeGreaterThan(500)
  })

  it('should handle very long titles without throwing', () => {
    const longTitle = 'A '.repeat(200).trim()
    const bytes = generateRequestPDF(makeRequest({ title: longTitle }))
    expect(pdfHeader(bytes).startsWith('%PDF-')).toBe(true)
  })

  it('should handle large intake data by producing more bytes / extra pages', () => {
    const big = makeRequest({
      intakeData: Object.fromEntries(
        Array.from({ length: 50 }, (_, i) => [
          `field-${i}`,
          'A lengthy answer that takes meaningful space on the page. '.repeat(5),
        ]),
      ),
    })
    const small = makeRequest({ intakeData: { only: 'one field' } })
    const bigBytes = generateRequestPDF(big)
    const smallBytes = generateRequestPDF(small)
    expect(bigBytes.length).toBeGreaterThan(smallBytes.length)
  })
})

function makeAnalyticsInput(overrides: Partial<AnalyticsPDFInput> = {}): AnalyticsPDFInput {
  return {
    orgName: 'Acme Inc',
    dateRange: { from: '2026-01-01', to: '2026-02-01' },
    summary: {
      totalRequests: 10,
      pendingReview: 3,
      inBacklog: 4,
      completed: 3,
      avgQualityScore: 72,
    },
    statusDistribution: [
      { status: 'UNDER_REVIEW', count: 3 },
      { status: 'COMPLETED', count: 3 },
    ],
    priorityDistribution: [
      { band: 'High', count: 2 },
      { band: 'Medium', count: 5 },
    ],
    timeToDecision: { avgDays: 4.2 },
    topRequesters: [{ userId: 'u1', name: 'Jane Doe', count: 5 }],
    decisionBreakdown: [{ decision: 'APPROVED', count: 6 }],
    voteSummary: {
      totalVotes: 20,
      uniqueVoters: 8,
      avgScore: 3.5,
      votedRequestsCount: 5,
      totalRequestsCount: 10,
    },
    ...overrides,
  }
}

describe('generateAnalyticsPDF', () => {
  it('should produce a non-empty Uint8Array starting with the PDF header', () => {
    const bytes = generateAnalyticsPDF(makeAnalyticsInput())
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(bytes.length).toBeGreaterThan(500)
    expect(pdfHeader(bytes).startsWith('%PDF-')).toBe(true)
  })

  it('should handle empty datasets without throwing', () => {
    const bytes = generateAnalyticsPDF(
      makeAnalyticsInput({
        dateRange: undefined,
        statusDistribution: [],
        priorityDistribution: [],
        topRequesters: [],
        decisionBreakdown: [],
        summary: {
          totalRequests: 0,
          pendingReview: 0,
          inBacklog: 0,
          completed: 0,
          avgQualityScore: null,
        },
        timeToDecision: { avgDays: null },
        voteSummary: {
          totalVotes: 0,
          uniqueVoters: 0,
          avgScore: 0,
          votedRequestsCount: 0,
          totalRequestsCount: 0,
        },
      }),
    )
    expect(pdfHeader(bytes).startsWith('%PDF-')).toBe(true)
  })
})
