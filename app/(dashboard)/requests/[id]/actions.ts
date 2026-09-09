"use server";

import { revalidatePath } from "next/cache";
import type { DecisionType, RequestStatus, UserRole } from "@/lib/types/database";
import { requireAuth } from "@/lib/auth/session";
import { canAccess } from "@/lib/auth/rbac";
import { getAvailableActions } from "@/lib/utils/workflow";
import {
  getFeatureRequestById,
  updateFeatureRequestStatus,
} from "@/lib/db/queries/feature-requests";
import {
  listCustomFieldDefinitions,
  updateRequestCustomFields,
} from "@/lib/db/queries/custom-fields";
import {
  validateCustomFieldValues,
  type RawCustomFieldValues,
} from "@/lib/utils/custom-fields";
import { applyDecision } from "@/lib/decisions/apply";
import { assertNoApprovalChainBypass } from "@/lib/approvals/engine";
import { notifyRequestOwner, notifyUser, getOrgUserIds } from "@/lib/db/queries/notifications";
import { logActivity } from "@/lib/db/queries/activity-log";
import { transaction } from '@/lib/db/pool';
import { lockActiveMemberRequest } from '@/lib/db/queries/request-access';
import { addComment as addCollaborativeComment } from './collaboration-actions';
import "@/lib/auth/types";

export async function submitDecision(
  requestId: string,
  decision: DecisionType,
  rationale: string
) {
  const session = await requireAuth();

  if (!canAccess(session.user.role as UserRole, "REVIEWER")) {
    throw new Error("Insufficient permissions: REVIEWER role required");
  }

  const target = await getFeatureRequestById(requestId);
  if (!target || target.organizationId !== session.user.orgId) {
    throw new Error("Feature request not found");
  }
  await assertNoApprovalChainBypass(session.user.orgId, target.status, decision);

  await applyDecision({
    requestId,
    organizationId: session.user.orgId,
    userId: session.user.id,
    decision,
    rationale,
  });

  revalidatePath("/requests/" + requestId);
  revalidatePath("/review");

  return { success: true };
}

export type UpdateCustomFieldsResult =
  | { success: true }
  | { success: false; errors: Record<string, string> };

/**
 * Replace the custom field values on a request. Editable by the requester and
 * by anyone with REVIEWER or higher; validation errors come back per field so
 * the form can render them inline instead of throwing.
 */
export async function updateCustomFields(
  requestId: string,
  values: RawCustomFieldValues
): Promise<UpdateCustomFieldsResult> {
  const session = await requireAuth();
  const orgId = session.user.orgId;
  if (!orgId) {
    throw new Error("No organization");
  }

  const request = await getFeatureRequestById(requestId);
  if (!request || request.organizationId !== orgId) {
    throw new Error("Feature request not found");
  }

  const isRequester = request.requesterId === session.user.id;
  if (!isRequester && !canAccess(session.user.role as UserRole, "REVIEWER")) {
    throw new Error("Insufficient permissions: REVIEWER role required");
  }

  const definitions = await listCustomFieldDefinitions(orgId);
  const validation = validateCustomFieldValues(definitions, values);
  if (!validation.ok) {
    return { success: false, errors: validation.errors };
  }

  await transaction(async () => {
    const current = await lockActiveMemberRequest(requestId, orgId, session.user.id);
    if (current.requesterId !== session.user.id && current.actorRole !== 'ADMIN' && current.actorRole !== 'REVIEWER') throw new Error('Insufficient permissions.');
    await updateRequestCustomFields(requestId, orgId, validation.values);
  });

  try {
    await logActivity({
      organizationId: orgId,
      requestId,
      userId: session.user.id,
      action: "REQUEST_UPDATED",
      entityType: "REQUEST",
      entityId: requestId,
      metadata: { customFields: Object.keys(validation.values) },
    });
  } catch { /* activity logging is non-critical */ }

  revalidatePath("/requests/" + requestId);

  return { success: true };
}

export async function addComment(
  requestId: string,
  content: string,
  parentId?: string
) {
  return addCollaborativeComment(requestId, content, parentId, []);
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
