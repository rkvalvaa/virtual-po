// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'
import { POST } from './route'
import { verifyProviderWebhook } from '@/lib/email/provider'
import { ingestEmailProviderEvent } from '@/lib/email/outbox'

vi.mock('@/lib/email/provider', () => ({ verifyProviderWebhook: vi.fn() }))
vi.mock('@/lib/email/outbox', () => ({ ingestEmailProviderEvent: vi.fn(async () => true) }))

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks() })

function request() {
  return new Request('https://vpo.example.test/api/webhooks/resend', {
    method: 'POST', body: '{"event":"payload"}',
    headers: { 'svix-id': 'event-id', 'svix-timestamp': '123', 'svix-signature': 'signature' },
  })
}

it('fails closed without a webhook signing secret', async () => {
  vi.stubEnv('RESEND_WEBHOOK_SECRET', '')
  expect((await POST(request())).status).toBe(503)
  expect(verifyProviderWebhook).not.toHaveBeenCalled()
})

it('caps streamed request bodies even when content-length is absent', async () => {
  vi.stubEnv('RESEND_WEBHOOK_SECRET', 'whsec_test')
  const chunk = new Uint8Array(600 * 1024)
  const body = new ReadableStream({ start(controller) { controller.enqueue(chunk); controller.enqueue(chunk); controller.close() } })
  const streamed = new Request('https://vpo.example.test/api/webhooks/resend', {
    method: 'POST', body, duplex: 'half',
    headers: { 'svix-id': 'event-id', 'svix-timestamp': '123', 'svix-signature': 'signature' },
  } as RequestInit & { duplex: 'half' })
  expect((await POST(streamed)).status).toBe(413)
  expect(verifyProviderWebhook).not.toHaveBeenCalled()
})

it('rejects invalid signatures without changing delivery state', async () => {
  vi.stubEnv('RESEND_WEBHOOK_SECRET', 'whsec_test')
  vi.mocked(verifyProviderWebhook).mockImplementation(() => { throw new Error('bad signature') })
  expect((await POST(request())).status).toBe(401)
  expect(ingestEmailProviderEvent).not.toHaveBeenCalled()
})

it('records verified delivery evidence by provider message id', async () => {
  vi.stubEnv('RESEND_WEBHOOK_SECRET', 'whsec_test')
  vi.mocked(verifyProviderWebhook).mockReturnValue({ type: 'email.delivered', providerMessageId: 'provider-1', detail: null, occurredAt: new Date('2026-09-09T09:00:00Z'), deliveryId: '01994ca8-d493-7000-8000-000000000001' })
  expect((await POST(request())).status).toBe(200)
  expect(verifyProviderWebhook).toHaveBeenCalledWith(expect.objectContaining({ secret: 'whsec_test', payload: '{"event":"payload"}' }))
  expect(ingestEmailProviderEvent).toHaveBeenCalledWith({ eventId: 'event-id', providerMessageId: 'provider-1', eventType: 'email.delivered', occurredAt: new Date('2026-09-09T09:00:00Z'), detail: null, deliveryId: '01994ca8-d493-7000-8000-000000000001' })
})

it('returns a retryable server error when verified evidence cannot be persisted', async () => {
  vi.stubEnv('RESEND_WEBHOOK_SECRET', 'whsec_test')
  vi.mocked(verifyProviderWebhook).mockReturnValue({ type: 'email.delivered', providerMessageId: 'provider-1', detail: null, occurredAt: new Date('2026-09-09T09:00:00Z'), deliveryId: null })
  vi.mocked(ingestEmailProviderEvent).mockRejectedValueOnce(new Error('database unavailable'))
  expect((await POST(request())).status).toBe(500)
})
