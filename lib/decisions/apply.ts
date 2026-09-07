import type { DecisionType, RequestStatus } from '@/lib/types/database';
import { canTransition } from '@/lib/utils/workflow';
import {
  getFeatureRequestById,
  updateFeatureRequestStatus,
} from '@/lib/db/queries/feature-requests';
import { createDecision } from '@/lib/db/queries/decisions';
import { notifyRequestOwner } from '@/lib/db/queries/notifications';
import { logActivity } from '@/lib/db/queries/activity-log';

export const DECISION_STATUS_MAP: Record<DecisionType, RequestStatus> = {
  APPROVE: 'APPROVED',
  REJECT: 'REJECTED',
  DEFER: 'DEFERRED',
  REQUEST_INFO: 'NEEDS_INFO',
};

/**
 * Record a review decision and move the request to its target status.
 *
 * Session-free on purpose: the caller authenticates the actor and checks their
 * role. Shared by the in-app server action and the Slack interaction webhook so
 * both produce identical decisions, activity log entries, and notifications.
 *
 * Throws on unknown request, cross-org access, or an illegal transition.
 */
export async function applyDecision(params: {
  requestId: string;
  /** Org the actor belongs to. A mismatch (or null) reads as "not found". */
  organizationId: string | null;
  userId: string;
  decision: DecisionType;
  rationale: string;
}): Promise<void> {
  const { requestId, organizationId, userId, decision, rationale } = params;

  const request = await getFeatureRequestById(requestId);
  if (!request || request.organizationId !== organizationId) {
    throw new Error('Feature request not found');
  }

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
}
