"use server";

import { revalidatePath } from "next/cache";
import type { DecisionType, RequestStatus, UserRole } from "@/lib/types/database";
import { requireAuth } from "@/lib/auth/session";
import { canAccess } from "@/lib/auth/rbac";
import { canTransition, getAvailableActions } from "@/lib/utils/workflow";
import {
  getFeatureRequestById,
  updateFeatureRequestStatus,
} from "@/lib/db/queries/feature-requests";
import { createDecision } from "@/lib/db/queries/decisions";
import { createComment } from "@/lib/db/queries/comments";
import { notifyRequestOwner, notifyUser, getOrgUserIds } from "@/lib/db/queries/notifications";
import { logActivity } from "@/lib/db/queries/activity-log";
import "@/lib/auth/types";

const DECISION_STATUS_MAP: Record<DecisionType, RequestStatus> = {
  APPROVE: "APPROVED",
  REJECT: "REJECTED",
  DEFER: "DEFERRED",
  REQUEST_INFO: "NEEDS_INFO",
};

export async function submitDecision(
  requestId: string,
  decision: DecisionType,
  rationale: string
) {
  const session = await requireAuth();

  if (!canAccess(session.user.role as UserRole, "REVIEWER")) {
    throw new Error("Insufficient permissions: REVIEWER role required");
  }

  const request = await getFeatureRequestById(requestId);
  if (!request) {
    throw new Error("Feature request not found");
  }
  if (request.organizationId !== session.user.orgId) {
    throw new Error("Feature request not found");
  }

  const targetStatus = DECISION_STATUS_MAP[decision];

  if (!canTransition(request.status, targetStatus)) {
    throw new Error(
      `Cannot transition from ${request.status} to ${targetStatus}`
    );
  }

  const decisionRecord = await createDecision(requestId, session.user.id, decision, rationale);
  await updateFeatureRequestStatus(requestId, targetStatus);

  try {
    await logActivity({
      organizationId: request.organizationId,
      requestId,
      userId: session.user.id,
      action: 'DECISION_MADE',
      entityType: 'DECISION',
      entityId: decisionRecord.id,
      metadata: { decision, rationale, targetStatus },
    });
  } catch { /* activity logging is non-critical */ }

  // Notify the request owner about the decision
  await notifyRequestOwner({
    organizationId: request.organizationId,
    requesterId: request.requesterId,
    type: "DECISION_MADE",
    title: `Request ${decision.toLowerCase()}d`,
    message: `"${request.title}" was ${decision.toLowerCase()}d. ${rationale}`,
    link: `/requests/${requestId}`,
    requestId,
    actorId: session.user.id,
  });

  revalidatePath("/requests/" + requestId);
  revalidatePath("/review");

  return { success: true };
}

export async function addComment(
  requestId: string,
  content: string,
  parentId?: string
) {
  const session = await requireAuth();

  const request = await getFeatureRequestById(requestId);
  if (!request) {
    throw new Error("Feature request not found");
  }
  if (request.organizationId !== session.user.orgId) {
    throw new Error("Feature request not found");
  }

  const comment = await createComment(
    requestId,
    session.user.id,
    content,
    parentId
  );

  try {
    await logActivity({
      organizationId: request.organizationId,
      requestId,
      userId: session.user.id,
      action: 'COMMENT_ADDED',
      entityType: 'COMMENT',
      entityId: comment.id,
      metadata: { preview: content.slice(0, 100) },
    });
  } catch { /* activity logging is non-critical */ }

  // Notify the request owner about the new comment
  await notifyRequestOwner({
    organizationId: request.organizationId,
    requesterId: request.requesterId,
    type: "COMMENT_ADDED",
    title: "New comment",
    message: `${session.user.name ?? "Someone"} commented on "${request.title}"`,
    link: `/requests/${requestId}`,
    requestId,
    actorId: session.user.id,
  });

  revalidatePath("/requests/" + requestId);

  return { success: true, commentId: comment.id };
}

export async function transitionStatus(
  requestId: string,
  targetStatus: RequestStatus
) {
  const session = await requireAuth();

  const request = await getFeatureRequestById(requestId);
  if (!request) {
    throw new Error("Feature request not found");
  }
  if (request.organizationId !== session.user.orgId) {
    throw new Error("Feature request not found");
  }

  const availableActions = getAvailableActions(
    request.status,
    session.user.role as UserRole
  );
  const isAllowed = availableActions.some(
    (action) => action.targetStatus === targetStatus
  );

  if (!isAllowed) {
    throw new Error(
      `Cannot transition from ${request.status} to ${targetStatus} with role ${session.user.role}`
    );
  }

  await updateFeatureRequestStatus(requestId, targetStatus);

  try {
    await logActivity({
      organizationId: request.organizationId,
      requestId,
      userId: session.user.id,
      action: 'STATUS_CHANGED',
      entityType: 'REQUEST',
      entityId: requestId,
      metadata: { from: request.status, to: targetStatus },
    });
  } catch { /* activity logging is non-critical */ }

  // Notify the request owner about the status change
  await notifyRequestOwner({
    organizationId: request.organizationId,
    requesterId: request.requesterId,
    type: "STATUS_CHANGED",
    title: "Status updated",
    message: `"${request.title}" moved to ${targetStatus.replace(/_/g, " ")}`,
    link: `/requests/${requestId}`,
    requestId,
    actorId: session.user.id,
  });

  // If moving to UNDER_REVIEW, notify all reviewers
  if (targetStatus === "UNDER_REVIEW" && session.user.orgId) {
    const orgUsers = await getOrgUserIds(session.user.orgId, session.user.id);
    for (const uid of orgUsers) {
      await notifyUser({
        organizationId: session.user.orgId,
        userId: uid,
        type: "REVIEW_NEEDED",
        title: "Review needed",
        message: `"${request.title}" is ready for review`,
        link: `/requests/${requestId}`,
        requestId,
        actorId: session.user.id,
      });
    }
  }

  revalidatePath("/requests/" + requestId);
  revalidatePath("/review");

  return { success: true };
}
