import { describe, it, expect } from 'vitest'
import { generateRequestPDF } from './pdf'
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
