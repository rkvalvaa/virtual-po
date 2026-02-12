import { NextResponse } from 'next/server';
import { validateApiKey, hasScope } from '@/lib/api/auth';
import { rateLimit, rateLimitHeaders } from '@/lib/api/rate-limit';
import { getFeatureRequestById, updateFeatureRequest } from '@/lib/db/queries/feature-requests';
import { getEpicByRequestId, getStoriesByEpicId } from '@/lib/db/queries/epics';
import { dispatchWebhookEvent } from '@/lib/api/webhooks';
import { REQUEST_STATUSES } from '@/lib/types/database';
import type { RequestStatus } from '@/lib/types/database';

function errorResponse(
  message: string,
  code: string,
  status: number,
  headers?: Record<string, string>
) {
  return NextResponse.json({ error: message, code }, { status, headers });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id } = await params;
  const featureRequest = await getFeatureRequestById(id);

  if (!featureRequest) {
    return errorResponse('Feature request not found', 'NOT_FOUND', 404, rlHeaders);
  }

  if (featureRequest.organizationId !== auth.orgId) {
    return errorResponse('Feature request not found', 'NOT_FOUND', 404, rlHeaders);
  }

  // Include epic and stories if they exist
  const epic = await getEpicByRequestId(id);
  let stories = null;
  if (epic) {
    stories = await getStoriesByEpicId(epic.id);
  }

  return NextResponse.json(
    {
      data: {
        ...featureRequest,
        epic: epic ?? null,
        stories: stories ?? [],
      },
    },
    { headers: rlHeaders }
  );
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const { id } = await params;
  const existing = await getFeatureRequestById(id);

  if (!existing) {
    return errorResponse('Feature request not found', 'NOT_FOUND', 404, rlHeaders);
  }

  if (existing.organizationId !== auth.orgId) {
    return errorResponse('Feature request not found', 'NOT_FOUND', 404, rlHeaders);
  }

  let body: { title?: string; summary?: string; status?: string; tags?: string[] };
  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body', 'INVALID_BODY', 400, rlHeaders);
  }

  const updateData: Record<string, unknown> = {};

  if (body.title !== undefined) {
    if (typeof body.title !== 'string' || body.title.trim().length === 0) {
      return errorResponse('title must be a non-empty string', 'INVALID_PARAMETER', 400, rlHeaders);
    }
    updateData.title = body.title.trim();
  }

  if (body.summary !== undefined) {
    if (typeof body.summary !== 'string') {
      return errorResponse('summary must be a string', 'INVALID_PARAMETER', 400, rlHeaders);
    }
    updateData.summary = body.summary.trim();
  }

  if (body.status !== undefined) {
    if (!REQUEST_STATUSES.includes(body.status as RequestStatus)) {
      return errorResponse(`Invalid status: ${body.status}`, 'INVALID_PARAMETER', 400, rlHeaders);
    }
    updateData.status = body.status;
  }

  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags) || !body.tags.every((t) => typeof t === 'string')) {
      return errorResponse('tags must be an array of strings', 'INVALID_PARAMETER', 400, rlHeaders);
    }
    updateData.tags = body.tags;
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ data: existing }, { headers: rlHeaders });
  }

  const updated = await updateFeatureRequest(id, updateData);

  if (body.status !== undefined && body.status !== existing.status) {
    dispatchWebhookEvent(auth.orgId, 'request.status_changed', {
      requestId: id,
      previousStatus: existing.status,
      newStatus: body.status,
    });
  }

  if (body.title !== undefined || body.summary !== undefined || body.tags !== undefined) {
    dispatchWebhookEvent(auth.orgId, 'request.updated', {
      requestId: id,
      updatedFields: Object.keys(updateData),
    });
  }

  return NextResponse.json({ data: updated }, { headers: rlHeaders });
}
