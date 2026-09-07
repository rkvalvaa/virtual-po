import { describe, it, expect, vi, afterEach } from 'vitest'
import { log } from './logger'

function captureLine(
  method: 'log' | 'warn' | 'error',
  emit: () => void
): Record<string, unknown> {
  const spy = vi.spyOn(console, method).mockImplementation(() => {})
  emit()
  expect(spy).toHaveBeenCalledTimes(1)
  return JSON.parse(spy.mock.calls[0][0] as string)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('log', () => {
  it('should emit a single valid JSON line with level, event and ts', () => {
    const parsed = captureLine('log', () => log.info('thing.happened'))
    expect(parsed.level).toBe('info')
    expect(parsed.event).toBe('thing.happened')
    expect(typeof parsed.ts).toBe('string')
    expect(new Date(parsed.ts as string).toISOString()).toBe(parsed.ts)
  })

  it('should merge fields into the top-level object', () => {
    const parsed = captureLine('warn', () =>
      log.warn('db.slow_query', { sql: 'SELECT 1', durationMs: 900, rows: 1 })
    )
    expect(parsed.level).toBe('warn')
    expect(parsed.sql).toBe('SELECT 1')
    expect(parsed.durationMs).toBe(900)
    expect(parsed.rows).toBe(1)
  })

  it('should serialize Error fields to name/message/stack', () => {
    const err = new TypeError('boom')
    const parsed = captureLine('error', () => log.error('op.failed', { err }))
    expect(parsed.level).toBe('error')
    expect(parsed.err).toMatchObject({ name: 'TypeError', message: 'boom' })
    expect(typeof (parsed.err as { stack: unknown }).stack).toBe('string')
  })

  it('should route each level to the matching console method', () => {
    const info = vi.spyOn(console, 'log').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    log.info('a')
    log.warn('b')
    log.error('c')

    expect(info).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(error).toHaveBeenCalledTimes(1)
  })

  it('should emit a parseable line when no fields are given', () => {
    const parsed = captureLine('log', () => log.info('bare.event'))
    expect(Object.keys(parsed).sort()).toEqual(['event', 'level', 'ts'])
  })
})
