import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const queryMock = vi.fn()

vi.mock('@/lib/db/pool', () => ({
  query: (text: string, params?: unknown[]) => queryMock(text, params),
}))

import { GET, dynamic } from './route'

beforeEach(() => {
  queryMock.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('GET /api/health', () => {
  it('should be force-dynamic so the probe is never cached', () => {
    expect(dynamic).toBe('force-dynamic')
  })

  it('should return 200 with ok status when the database responds', async () => {
    queryMock.mockResolvedValue({ rows: [{ '?column?': 1 }], rowCount: 1 })

    const response = await GET()
    expect(response.status).toBe(200)

    const body = await response.json()
    expect(body.status).toBe('ok')
    expect(body.db).toBe('ok')
    expect(typeof body.version).toBe('string')
    expect(typeof body.uptimeSec).toBe('number')
    expect(body.uptimeSec).toBeGreaterThanOrEqual(0)
  })

  it('should probe the database with SELECT 1', async () => {
    queryMock.mockResolvedValue({ rows: [], rowCount: 0 })
    await GET()
    expect(queryMock).toHaveBeenCalledWith('SELECT 1', undefined)
  })

  it('should return 503 degraded when the database query rejects', async () => {
    queryMock.mockRejectedValue(new Error('connection refused'))

    const response = await GET()
    expect(response.status).toBe(503)

    const body = await response.json()
    expect(body).toEqual({ status: 'degraded', db: 'error' })
  })

  it('should not leak the database error message in the response body', async () => {
    queryMock.mockRejectedValue(new Error('password authentication failed'))

    const response = await GET()
    const text = await response.text()
    expect(text).not.toContain('password')
  })
})
