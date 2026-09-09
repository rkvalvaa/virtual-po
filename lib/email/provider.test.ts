// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sendProviderEmail, verifyProviderWebhook } from './provider'

const send = vi.hoisted(() => vi.fn())
const verify = vi.hoisted(() => vi.fn())
vi.mock('resend', () => ({ Resend: class { emails = { send }; webhooks = { verify } } }))

const email = {
  from: 'VPO <sender@example.test>', to: 'admin@example.test', subject: 'Test',
  html: '<p>Test</p>', text: 'Test', idempotencyKey: 'email-delivery/123',
  tags: [{ name: 'delivery_id', value: '01994ca8-d493-7000-8000-000000000001' }],
}

describe('email provider adapter', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks() })

  it('passes the stable idempotency key separately from message content', async () => {
    vi.stubEnv('RESEND_API_KEY', 'secret')
    send.mockResolvedValue({ data: { id: 'provider-id' }, error: null })
    expect(await sendProviderEmail(email)).toEqual({ accepted: true, providerMessageId: 'provider-id' })
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: email.to, tags: email.tags }), { idempotencyKey: email.idempotencyKey })
  })

  it('returns provider errors and marks only transient responses retryable', async () => {
    vi.stubEnv('RESEND_API_KEY', 'secret')
    send.mockResolvedValueOnce({ data: null, error: { name: 'rate_limit_exceeded', message: 'Slow down', statusCode: 429 } })
    expect(await sendProviderEmail(email)).toEqual({ accepted: false, errorCode: 'rate_limit_exceeded', message: 'Slow down', retryable: true })
    send.mockResolvedValueOnce({ data: null, error: { name: 'validation_error', message: 'Bad sender', statusCode: 422 } })
    expect(await sendProviderEmail(email)).toEqual({ accepted: false, errorCode: 'validation_error', message: 'Bad sender', retryable: false })
  })

  it('accepts only a valid local delivery UUID from verified provider tags', () => {
    verify.mockReturnValue({
      type: 'email.delivered', created_at: '2026-09-09T09:00:00Z',
      data: { email_id: 'provider-id', tags: { delivery_id: '01994ca8-d493-7000-8000-000000000001' } },
    })
    expect(verifyProviderWebhook({ payload: '{}', id: 'event', timestamp: '1', signature: 'sig', secret: 'secret' })).toMatchObject({
      providerMessageId: 'provider-id', deliveryId: '01994ca8-d493-7000-8000-000000000001',
    })
    verify.mockReturnValue({
      type: 'email.delivered', created_at: '2026-09-09T09:00:00Z',
      data: { email_id: 'provider-id', tags: { delivery_id: 'not-a-uuid' } },
    })
    expect(verifyProviderWebhook({ payload: '{}', id: 'event', timestamp: '1', signature: 'sig', secret: 'secret' }).deliveryId).toBeNull()
  })
})
