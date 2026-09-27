import { NextResponse } from 'next/server';
import { validateApiKey, hasScope } from '@/lib/api/auth';
import { rateLimit, rateLimitHeaders } from '@/lib/api/rate-limit';
import { getFeatureRequestById, updateFeatureRequest } from '@/lib/db/queries/feature-requests';
import { getEpicByRequestId, getStoriesByEpicId } from '@/lib/db/queries/epics';
import { getOrganizationRole } from '@/lib/db/queries/organizations';
import { applyDecision, decisionForStatus } from '@/lib/decisions/apply';
import { canAccess } from '@/lib/auth/rbac';
import { canTransition } from '@/lib/utils/workflow';
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

  if (body.status !== undefined && !REQUEST_STATUSES.includes(body.status as RequestStatus)) {
    return errorResponse(`Invalid status: ${body.status}`, 'INVALID_PARAMETER', 400, rlHeaders);
  }

  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags) || !body.tags.every((t) => typeof t === 'string')) {
      return errorResponse('tags must be an array of strings', 'INVALID_PARAMETER', 400, rlHeaders);
    }
    updateData.tags = body.tags;
  }

  // Status last, after every field has validated, so a refused body changes nothing.
  const status = body.status as RequestStatus | undefined;
  if (status && status !== existing.status) {
    const decision = decisionForStatus(status);
    if (decision) {
      const actorId = auth.createdBy;
      const role = actorId ? await getOrganizationRole(auth.orgId, actorId) : null;
      if (!actorId || !role || !canAccess(role, 'REVIEWER')) {
        return errorResponse('Decisions need an API key created by a current REVIEWER or ADMIN', 'FORBIDDEN', 403, rlHeaders);
      }
      try {
        await applyDecision({
          requestId: id,
          organizationId: auth.orgId,
          userId: actorId,
          decision,
          rationale: 'Decision recorded through the API',
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Decision refused';
        return errorResponse(message, 'DECISION_REFUSED', 409, rlHeaders);
      }
    } else if (!canTransition(existing.status, status)) {
      return errorResponse(`Cannot transition from ${existing.status} to ${status}`, 'INVALID_TRANSITION', 409, rlHeaders);
    } else {
      updateData.status = status;
    }
  }

  const updated = Object.keys(updateData).length > 0
    ? await updateFeatureRequest(id, updateData)
    : await getFeatureRequestById(id);

  return NextResponse.json({ data: updated }, { headers: rlHeaders });
}
