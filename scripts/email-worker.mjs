import { setTimeout } from 'node:timers/promises'

const base = process.env.EMAIL_WORKER_URL
const secret = process.env.CRON_SECRET
if (!base || !secret) throw new Error('EMAIL_WORKER_URL and CRON_SECRET are required')
const endpoint = new URL('/api/cron/email', base)
if (endpoint.protocol !== 'https:' && !(endpoint.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname))) {
  throw new Error('Worker URL must use HTTPS (HTTP is allowed only on localhost)')
}
if (endpoint.username || endpoint.password) throw new Error('Worker URL must not include credentials')

const shutdown = new AbortController()
process.once('SIGINT', () => shutdown.abort())
process.once('SIGTERM', () => shutdown.abort())

do {
  try {
    const response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${secret}` },
      redirect: 'error',
      signal: AbortSignal.any([shutdown.signal, AbortSignal.timeout(55_000)]),
    })
    if (!response.ok) throw new Error('Worker request failed')
    const result = await response.json()
    console.info('Email sweep completed', { processed: result.processed })
  } catch {
    if (!shutdown.signal.aborted) {
      console.error('Email sweep failed; check service health and cron configuration')
      if (process.argv.includes('--once')) process.exitCode = 1
    }
  }
  if (process.argv.includes('--once') || shutdown.signal.aborted) break
  await setTimeout(60_000, undefined, { signal: shutdown.signal }).catch(() => {})
} while (!shutdown.signal.aborted)
