import { ingestEmailProviderEvent } from '@/lib/email/outbox'
import { verifyProviderWebhook } from '@/lib/email/provider'

const MAX_WEBHOOK_BYTES = 1024 * 1024

async function readBoundedBody(request: Request): Promise<string | null> {
  if (!request.body) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_WEBHOOK_BYTES) { await reader.cancel(); return null }
    chunks.push(value)
  }
  const body = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength }
  return new TextDecoder().decode(body)
}

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.RESEND_WEBHOOK_SECRET
  if (!secret) return Response.json({ error: 'Email webhook is not configured' }, { status: 503 })
  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (contentLength > MAX_WEBHOOK_BYTES) return Response.json({ error: 'Payload too large' }, { status: 413 })

  const id = request.headers.get('svix-id')
  const timestamp = request.headers.get('svix-timestamp')
  const signature = request.headers.get('svix-signature')
  if (!id || !timestamp || !signature) return Response.json({ error: 'Invalid signature' }, { status: 401 })

  const payload = await readBoundedBody(request)
  if (payload === null) return Response.json({ error: 'Payload too large' }, { status: 413 })
  let event
  try {
    event = verifyProviderWebhook({ payload, id, timestamp, signature, secret })
  } catch {
    return Response.json({ error: 'Invalid signature' }, { status: 401 })
  }
  try {
    if (event.providerMessageId) await ingestEmailProviderEvent({
      eventId: id,
      providerMessageId: event.providerMessageId,
      eventType: event.type,
      occurredAt: event.occurredAt,
      detail: event.detail,
      deliveryId: event.deliveryId,
    })
    return Response.json({ accepted: true }, { status: 200 })
  } catch {
    return Response.json({ error: 'Unable to record delivery event' }, { status: 500 })
  }
}
