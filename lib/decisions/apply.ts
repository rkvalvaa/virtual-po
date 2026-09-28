import type { DecisionType, RequestStatus } from '@/lib/types/database';
import { canTransition } from '@/lib/utils/workflow';
import {
  getFeatureRequestById,
  updateFeatureRequestStatus,
} from '@/lib/db/queries/feature-requests';
import { createDecision } from '@/lib/db/queries/decisions';
import { notifyRequestOwner } from '@/lib/db/queries/notifications';
import { logActivity } from '@/lib/db/queries/activity-log';
import { getActiveWorkflow } from '@/lib/db/queries/approval-workflows';
import { query, transaction } from '@/lib/db/pool';

export const DECISION_STATUS_MAP: Record<DecisionType, RequestStatus> = {
  APPROVE: 'APPROVED',
  REJECT: 'REJECTED',
  DEFER: 'DEFERRED',
  REQUEST_INFO: 'NEEDS_INFO',
};

/** The decision a status change amounts to, or null for a plain lifecycle move. */
export function decisionForStatus(status: RequestStatus): DecisionType | null {
  const decisions = Object.keys(DECISION_STATUS_MAP) as DecisionType[];
  return decisions.find((d) => DECISION_STATUS_MAP[d] === status) ?? null;
}

/**
 * Reject a direct APPROVE/REJECT that would skip the org's active chain.
 *
 * applyDecision runs this itself, so every entry point (in-app, bulk, API,
 * Slack) is covered. Exported for callers that only want the refusal reason.
 */
export async function assertNoApprovalChainBypass(
  orgId: string | null,
  requestStatus: RequestStatus,
  decision: DecisionType
): Promise<void> {
  if (decision !== 'APPROVE' && decision !== 'REJECT') return;
  if (requestStatus !== 'UNDER_REVIEW' || !orgId) return;

  const workflow = await getActiveWorkflow(orgId);
  if (workflow && workflow.steps.length > 0) {
    throw new Error(
      `The "${workflow.name}" approval chain governs this request — approve or reject it step by step`
    );
  }
}

/**
 * Record a review decision and move the request to its target status.
 *
 * Session-free on purpose: the caller authenticates the actor and checks their
 * role. Every decision entry point (in-app, bulk, API v1, Slack, the approval
 * chain) goes through here so all produce identical decisions, activity log
 * entries, and notifications.
 *
 * Throws on unknown request, cross-org access, an illegal transition, or an
 * APPROVE/REJECT that would skip an active approval chain.
 */
export async function applyDecision(params: {
  requestId: string;
  /** Org the actor belongs to. A mismatch (or null) reads as "not found". */
  organizationId: string | null;
  userId: string;
  decision: DecisionType;
  rationale: string;
  /** Set only by the approval chain itself, which finishes through here. */
  chainVetted?: boolean;
}): Promise<void> {
  const { requestId, organizationId, userId, decision, rationale, chainVetted } = params;
  await transaction(async () => {
  await query('SELECT id FROM feature_requests WHERE id=$1 AND organization_id=$2 FOR UPDATE', [requestId, organizationId]);
  const request = await getFeatureRequestById(requestId);
  if (!request || request.organizationId !== organizationId) {
    throw new Error('Feature request not found');
  }
  if (request.archivedAt) throw new Error('Restore this archived request before making a decision.');
  if (!chainVetted) await assertNoApprovalChainBypass(organizationId, request.status, decision);

  const targetStatus = DECISION_STATUS_MAP[decision];
  if (!canTransition(request.status, targetStatus)) {
    throw new Error(`Cannot transition from ${request.status} to ${targetStatus}`);
  }

  const decisionRecord = await createDecision(requestId, userId, decision, rationale);
  await updateFeatureRequestStatus(requestId, targetStatus);

  try {
    await logActivity({
      organizationId: request.organizationId,
      requestId,
      userId,
      action: 'DECISION_MADE',
      entityType: 'DECISION',
      entityId: decisionRecord.id,
      metadata: { decision, rationale, targetStatus },
    });
  } catch { /* activity logging is non-critical */ }

  await notifyRequestOwner({
    organizationId: request.organizationId,
    requesterId: request.requesterId,
    type: 'DECISION_MADE',
    title: `Request ${decision.toLowerCase()}d`,
    message: `"${request.title}" was ${decision.toLowerCase()}d. ${rationale}`,
    link: `/requests/${requestId}`,
    requestId,
    actorId: userId,
  });
  });
}
