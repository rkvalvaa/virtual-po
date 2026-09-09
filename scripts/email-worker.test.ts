// @vitest-environment node
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'

async function invokeWorker(status: number) {
  const requests: { path?: string; authorization?: string }[] = []
  const server = createServer((request, response) => {
    requests.push({ path: request.url, authorization: request.headers.authorization })
    response.writeHead(status, { 'Content-Type': 'application/json', ...(status === 302 ? { Location: '/redirect-target' } : {}) })
    response.end(JSON.stringify({ processed: 2 }))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Test listener unavailable')
  try {
    const child = spawn(process.execPath, [resolve('scripts/email-worker.mjs'), '--once'], {
      env: { ...process.env, EMAIL_WORKER_URL: `http://127.0.0.1:${address.port}`, CRON_SECRET: 'worker-test-secret' },
      windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout.on('data', chunk => { output += chunk.toString() })
    child.stderr.on('data', chunk => { output += chunk.toString() })
    const timer = setTimeout(() => child.kill(), 5000)
    try {
      const [code] = await once(child, 'close')
      return { code, output, requests }
    } finally { clearTimeout(timer) }
  } finally { await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done())) }
}

it('runs the supported one-shot worker against its authenticated endpoint and exits', async () => {
  const result = await invokeWorker(200)
  expect(result.code).toBe(0)
  expect(result.requests).toEqual([{ path: '/api/cron/email', authorization: 'Bearer worker-test-secret' }])
  expect(result.output).toContain('processed: 2')
  expect(result.output).not.toContain('worker-test-secret')
})

it.each([503, 302])('reports HTTP %s as a failed worker invocation without leaking credentials or following redirects', async status => {
  const result = await invokeWorker(status)
  expect(result.code).toBe(1)
  expect(result.requests).toHaveLength(1)
  expect(result.output).toContain('Email sweep failed')
  expect(result.output).not.toContain('worker-test-secret')
})
