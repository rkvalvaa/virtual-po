import { NextResponse } from 'next/server';
import { validateApiKey, hasScope } from '@/lib/api/auth';
import { rateLimit, rateLimitHeaders } from '@/lib/api/rate-limit';
import {
  updateWebhookSubscription,
  deleteWebhookSubscription,
  getWebhooksByOrg,
} from '@/lib/db/queries/webhooks';
import { WEBHOOK_EVENTS } from '@/lib/types/database';
import type { WebhookEvent } from '@/lib/types/database';

function errorResponse(
  message: string,
  code: string,
  status: number,
  headers?: Record<string, string>
) {
  return NextResponse.json({ error: message, code }, { status, headers });
}

async function findWebhookForOrg(orgId: string, webhookId: string) {
  const webhooks = await getWebhooksByOrg(orgId);
  return webhooks.find((w) => w.id === webhookId) ?? null;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await validateApiKey(req);
  if (!auth) {
    return errorResponse('Invalid or missing API key', 'UNAUTHORIZED', 401);
  }

  if (!hasScope(auth.scopes, 'admin')) {
    return errorResponse('Insufficient scope: admin required', 'FORBIDDEN', 403);
  }

  const rl = rateLimit(auth.orgId);
  const rlHeaders = rateLimitHeaders(rl);

  if (!rl.allowed) {
    return errorResponse('Rate limit exceeded', 'RATE_LIMITED', 429, rlHeaders);
  }

  const { id } = await params;
  const existing = await findWebhookForOrg(auth.orgId, id);

  if (!existing) {
    return errorResponse('Webhook not found', 'NOT_FOUND', 404, rlHeaders);
  }

  let body: { url?: string; events?: string[]; isActive?: boolean };
  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body', 'INVALID_BODY', 400, rlHeaders);
  }

  if (body.url !== undefined && (typeof body.url !== 'string' || body.url.trim().length === 0)) {
    return errorResponse('url must be a non-empty string', 'INVALID_PARAMETER', 400, rlHeaders);
  }

  if (body.events !== undefined) {
    if (!Array.isArray(body.events) || body.events.length === 0) {
      return errorResponse('events must be a non-empty array', 'INVALID_PARAMETER', 400, rlHeaders);
    }
    const validEvents: readonly string[] = WEBHOOK_EVENTS;
    for (const event of body.events) {
      if (!validEvents.includes(event)) {
        return errorResponse(`Invalid event: ${event}`, 'INVALID_PARAMETER', 400, rlHeaders);
      }
    }
  }

  if (body.isActive !== undefined && typeof body.isActive !== 'boolean') {
    return errorResponse('isActive must be a boolean', 'INVALID_PARAMETER', 400, rlHeaders);
  }

  const updated = await updateWebhookSubscription(id, {
    url: body.url,
    events: body.events as WebhookEvent[] | undefined,
    isActive: body.isActive,
  });

  // Strip secret from response
  const { secret, ...data } = updated;
  void secret;
  return NextResponse.json({ data }, { headers: rlHeaders });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await validateApiKey(req);
  if (!auth) {
    return errorResponse('Invalid or missing API key', 'UNAUTHORIZED', 401);
  }

  if (!hasScope(auth.scopes, 'admin')) {
    return errorResponse('Insufficient scope: admin required', 'FORBIDDEN', 403);
  }

  const rl = rateLimit(auth.orgId);
  const rlHeaders = rateLimitHeaders(rl);

  if (!rl.allowed) {
    return errorResponse('Rate limit exceeded', 'RATE_LIMITED', 429, rlHeaders);
  }

  const { id } = await params;
  const existing = await findWebhookForOrg(auth.orgId, id);

  if (!existing) {
    return errorResponse('Webhook not found', 'NOT_FOUND', 404, rlHeaders);
  }

  await deleteWebhookSubscription(id);

  return NextResponse.json({ data: { deleted: true } }, { headers: rlHeaders });
}
