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

  await createDecision(requestId, session.user.id, decision, rationale);
  await updateFeatureRequestStatus(requestId, targetStatus);

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

  revalidatePath("/requests/" + requestId);
  revalidatePath("/review");

  return { success: true };
}
