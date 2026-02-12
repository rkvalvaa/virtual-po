import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { validateApiKey, hasScope } from '@/lib/api/auth';
import { rateLimit, rateLimitHeaders } from '@/lib/api/rate-limit';
import { createWebhookSubscription, getWebhooksByOrg } from '@/lib/db/queries/webhooks';
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

export async function GET(req: Request) {
  const auth = await validateApiKey(req);
  if (!auth) {
    return errorResponse('Invalid or missing API key', 'UNAUTHORIZED', 401);
  }

  if (!hasScope(auth.scopes, 'read')) {
    return errorResponse('Insufficient scope: read required', 'FORBIDDEN', 403);
  }

  const rl = rateLimit(auth.orgId);
  const rlHeaders = rateLimitHeaders(rl);

  if (!rl.allowed) {
    return errorResponse('Rate limit exceeded', 'RATE_LIMITED', 429, rlHeaders);
  }

  const webhooks = await getWebhooksByOrg(auth.orgId);

  // Strip secrets from response
  const data = webhooks.map((webhook) => {
    const { secret, ...rest } = webhook;
    void secret;
    return rest;
  });

  return NextResponse.json({ data }, { headers: rlHeaders });
}

export async function POST(req: Request) {
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

  let body: { url?: string; events?: string[]; secret?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body', 'INVALID_BODY', 400, rlHeaders);
  }

  if (!body.url || typeof body.url !== 'string') {
    return errorResponse('url is required', 'INVALID_PARAMETER', 400, rlHeaders);
  }

  if (!body.events || !Array.isArray(body.events) || body.events.length === 0) {
    return errorResponse('events must be a non-empty array', 'INVALID_PARAMETER', 400, rlHeaders);
  }

  const validEvents: readonly string[] = WEBHOOK_EVENTS;
  for (const event of body.events) {
    if (!validEvents.includes(event)) {
      return errorResponse(`Invalid event: ${event}`, 'INVALID_PARAMETER', 400, rlHeaders);
    }
  }

  const secret = body.secret ?? crypto.randomBytes(32).toString('hex');

  const webhook = await createWebhookSubscription(
    auth.orgId,
    body.url,
    secret,
    body.events as WebhookEvent[]
  );

  return NextResponse.json({ data: webhook }, { status: 201, headers: rlHeaders });
}
