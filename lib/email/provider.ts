import { Resend } from 'resend'
import type { WebhookEventPayload } from 'resend'

export interface ProviderEmail {
  from: string
  to: string
  subject: string
  html: string
  text: string
  idempotencyKey: string
  tags: { name: string; value: string }[]
}

export type ProviderEmailResult =
  | { accepted: true; providerMessageId: string }
  | { accepted: false; errorCode: string; message: string; retryable: boolean }

export async function sendProviderEmail(email: ProviderEmail): Promise<ProviderEmailResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { accepted: false, errorCode: 'PROVIDER_UNAVAILABLE', message: 'Email provider is not configured.', retryable: false }

  const result = await new Resend(apiKey).emails.send({
    from: email.from,
    to: email.to,
    subject: email.subject,
    html: email.html,
    text: email.text,
    tags: email.tags,
  }, { idempotencyKey: email.idempotencyKey })

  if (result.data?.id) return { accepted: true, providerMessageId: result.data.id }

  const error = result.error as { name?: string; message?: string; statusCode?: number } | null
  const status = error?.statusCode
  return {
    accepted: false,
    errorCode: error?.name ?? 'PROVIDER_REJECTED',
    message: error?.message ?? 'Email provider rejected the request.',
    retryable: status === 408 || status === 429 || (typeof status === 'number' && status >= 500),
  }
}

export interface ProviderWebhookInput {
  payload: string
  id: string
  timestamp: string
  signature: string
  secret: string
}

export interface VerifiedProviderWebhook {
  type: string
  providerMessageId: string | null
  detail: string | null
  occurredAt: Date
  deliveryId: string | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function verifyProviderWebhook(input: ProviderWebhookInput): VerifiedProviderWebhook {
  const event = new Resend().webhooks.verify({
    payload: input.payload,
    headers: { id: input.id, timestamp: input.timestamp, signature: input.signature },
    webhookSecret: input.secret,
  }) as WebhookEventPayload
  if (!event.type.startsWith('email.') || !('email_id' in event.data)) {
    return { type: event.type, providerMessageId: null, detail: null, occurredAt: new Date(event.created_at), deliveryId: null }
  }
  let detail: string | null = null
  if (event.type === 'email.failed') detail = event.data.failed.reason
  else if (event.type === 'email.bounced') detail = event.data.bounce.message
  else if (event.type === 'email.suppressed') detail = event.data.suppressed.message
  const deliveryId = (event.data as { tags?: Record<string, string> }).tags?.delivery_id
  return {
    type: event.type,
    providerMessageId: event.data.email_id,
    detail,
    occurredAt: new Date(event.created_at),
    deliveryId: deliveryId && UUID.test(deliveryId) ? deliveryId : null,
  }
}
