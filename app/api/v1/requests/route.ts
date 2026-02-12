import { NextResponse } from 'next/server';
import { validateApiKey, hasScope } from '@/lib/api/auth';
import { rateLimit, rateLimitHeaders } from '@/lib/api/rate-limit';
import { listFeatureRequests, createFeatureRequest } from '@/lib/db/queries/feature-requests';
import { dispatchWebhookEvent } from '@/lib/api/webhooks';
import type { RequestStatus } from '@/lib/types/database';
import { REQUEST_STATUSES } from '@/lib/types/database';

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

  const url = new URL(req.url);
  const status = url.searchParams.get('status') as RequestStatus | null;
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10) || 50, 100);
  const offset = parseInt(url.searchParams.get('offset') ?? '0', 10) || 0;

  if (status && !REQUEST_STATUSES.includes(status)) {
    return errorResponse(`Invalid status: ${status}`, 'INVALID_PARAMETER', 400, rlHeaders);
  }

  const result = await listFeatureRequests(auth.orgId, {
    status: status ?? undefined,
    limit,
    offset,
  });

  return NextResponse.json(
    { data: result.requests, total: result.total, limit, offset },
    { headers: rlHeaders }
  );
}

export async function POST(req: Request) {
  const auth = await validateApiKey(req);
  if (!auth) {
    return errorResponse('Invalid or missing API key', 'UNAUTHORIZED', 401);
  }

  if (!hasScope(auth.scopes, 'write')) {
    return errorResponse('Insufficient scope: write required', 'FORBIDDEN', 403);
  }

  const rl = rateLimit(auth.orgId);
  const rlHeaders = rateLimitHeaders(rl);

  if (!rl.allowed) {
    return errorResponse('Rate limit exceeded', 'RATE_LIMITED', 429, rlHeaders);
  }

  let body: { title?: string; summary?: string };
  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body', 'INVALID_BODY', 400, rlHeaders);
  }

  if (!body.title || typeof body.title !== 'string' || body.title.trim().length === 0) {
    return errorResponse('title is required', 'INVALID_PARAMETER', 400, rlHeaders);
  }

  // Use a placeholder requester ID for API-created requests (no user session)
  const featureRequest = await createFeatureRequest(
    auth.orgId,
    '00000000-0000-0000-0000-000000000000', // API requester placeholder
    body.title.trim()
  );

  if (body.summary && typeof body.summary === 'string') {
    // Update summary via a direct approach since createFeatureRequest doesn't accept it
    const { updateFeatureRequest } = await import('@/lib/db/queries/feature-requests');
    await updateFeatureRequest(featureRequest.id, { summary: body.summary.trim() });
    featureRequest.summary = body.summary.trim();
  }

  dispatchWebhookEvent(auth.orgId, 'request.created', {
    requestId: featureRequest.id,
    title: featureRequest.title,
    status: featureRequest.status,
  });

  return NextResponse.json({ data: featureRequest }, { status: 201, headers: rlHeaders });
}
