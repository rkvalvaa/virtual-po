import type {
  ApprovalDecision,
  ApprovalStep,
  ApprovalWorkflowWithSteps,
  DecisionType,
  FeatureRequest,
  RequestApproval,
  RequestStatus,
  UserRole,
} from '@/lib/types/database';
import { canAccess } from '@/lib/auth/rbac';
import { applyDecision } from '@/lib/decisions/apply';
import { getFeatureRequestById } from '@/lib/db/queries/feature-requests';
import {
  getActiveWorkflow,
  listRequestApprovals,
  recordStepApproval,
} from '@/lib/db/queries/approval-workflows';
import { getOrganizationUsers } from '@/lib/db/queries/organizations';
import { notifyUser } from '@/lib/db/queries/notifications';
import { logActivity } from '@/lib/db/queries/activity-log';

/**
 * APPROVED / REJECTED — the step has a recorded decision.
 * PENDING  — the step the chain is waiting on right now.
 * WAITING  — a later step, not reachable yet.
 */
export type ApprovalStepStatus = 'APPROVED' | 'REJECTED' | 'PENDING' | 'WAITING';

export interface ApprovalStepState {
  step: ApprovalStep;
  status: ApprovalStepStatus;
  approval?: RequestApproval;
}

export interface ApprovalState {
  steps: ApprovalStepState[];
  /** The step awaiting a decision, or null when the chain is resolved. */
  currentStep: ApprovalStep | null;
  isComplete: boolean;
  isRejected: boolean;
}

/**
 * Derive the chain's state from its steps and the approvals recorded so far.
 *
 * Pure — no request argument: nothing about the state depends on the request
 * itself, and the callers already gate on status === 'UNDER_REVIEW'.
 */
export function getApprovalState(
  workflow: ApprovalWorkflowWithSteps,
  approvals: RequestApproval[]
): ApprovalState {
  const ordered = [...workflow.steps].sort((a, b) => a.stepOrder - b.stepOrder);
  const byStepId = new Map(approvals.map((a) => [a.stepId, a]));

  const steps: ApprovalStepState[] = [];
  let currentStep: ApprovalStep | null = null;
  let isRejected = false;

  for (const step of ordered) {
    const approval = byStepId.get(step.id);

    // Everything after a rejection or after the pending step is unreachable.
    if (isRejected || currentStep) {
      steps.push({ step, status: 'WAITING' });
      continue;
    }

    if (!approval) {
      currentStep = step;
      steps.push({ step, status: 'PENDING' });
      continue;
    }

    if (approval.decision === 'REJECTED') isRejected = true;
    steps.push({ step, status: approval.decision, approval });
  }

  return {
    steps,
    currentStep,
    isComplete: ordered.length > 0 && !isRejected && currentStep === null,
    isRejected,
  };
}

/**
 * May this user decide this step?
 *
 * Role steps use the app-wide hierarchy (canAccess), so an ADMIN can always
 * unblock a REVIEWER step. User steps are that user only.
 */
export function canActOnStep(
  step: ApprovalStep,
  userId: string,
  role: UserRole
): boolean {
  if (step.approverUserId) return step.approverUserId === userId;
  if (step.approverRole) return canAccess(role, step.approverRole);
  return false;
}

/**
 * Reject a direct APPROVE/REJECT that would skip the org's active chain.
 *
 * Hiding the buttons in DecisionPanel is not enforcement — the server action
 * and the Slack interaction webhook both reach applyDecision on their own.
 *
 * ponytail: guards the two entry points rather than applyDecision itself,
 * since the chain finishes *through* applyDecision. If a third caller ever
 * appears, move the check into applyDecision behind an "already vetted" flag.
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

/** Who to ping when a step becomes the pending one. */
async function notifyStepApprovers(params: {
  organizationId: string;
  step: ApprovalStep;
  requestId: string;
  requestTitle: string;
  actorId: string;
}): Promise<void> {
  const { organizationId, step, requestId, requestTitle, actorId } = params;

  let userIds: string[];
  if (step.approverUserId) {
    userIds = [step.approverUserId];
  } else {
    const members = await getOrganizationUsers(organizationId);
    userIds = members.filter((m) => m.role === step.approverRole).map((m) => m.userId);
  }

  for (const userId of userIds) {
    await notifyUser({
      organizationId,
      userId,
      type: 'REVIEW_NEEDED',
      title: 'Approval needed',
      message: `"${requestTitle}" is waiting on approval step ${step.stepOrder}: ${step.name}`,
      link: `/requests/${requestId}`,
      requestId,
      actorId,
    });
  }
}

/**
 * Record one approver's decision on the chain's current step.
 *
 * A REJECT ends the chain immediately; the final APPROVE completes it. Both
 * finish through applyDecision, so the status transition, decision record,
 * activity entry and owner notification stay identical to a direct review.
 *
 * Session-free like applyDecision: the caller authenticates the actor.
 */
export async function submitStepApproval(params: {
  requestId: string;
  /** Org the actor belongs to. A mismatch (or null) reads as "not found". */
  orgId: string | null;
  userId: string;
  role: UserRole;
  decision: ApprovalDecision;
  rationale: string;
}): Promise<{ status: 'RECORDED' | 'APPROVED' | 'REJECTED' }> {
  const { requestId, orgId, userId, role, decision, rationale } = params;

  const request = await getFeatureRequestById(requestId);
  if (!request || !orgId || request.organizationId !== orgId) {
    throw new Error('Feature request not found');
  }
  if (request.status !== 'UNDER_REVIEW') {
    throw new Error(`Request is ${request.status}, not under review`);
  }

  const workflow = await getActiveWorkflow(orgId);
  if (!workflow || workflow.steps.length === 0) {
    throw new Error('No active approval workflow');
  }

  const approvals = await listRequestApprovals(requestId);
  const state = getApprovalState(workflow, approvals);
  const step = state.currentStep;
  if (!step) {
    throw new Error('Approval chain is already resolved');
  }
  if (!canActOnStep(step, userId, role)) {
    throw new Error(`You are not an approver for step ${step.stepOrder}: ${step.name}`);
  }

  const trimmed = rationale.trim();
  const approval = await recordStepApproval({
    requestId,
    stepId: step.id,
    approverId: userId,
    decision,
    rationale: trimmed || null,
  });

  try {
    await logActivity({
      organizationId: request.organizationId,
      requestId,
      userId,
      action: 'DECISION_MADE',
      entityType: 'DECISION',
      entityId: approval.id,
      metadata: {
        decision,
        rationale: trimmed,
        step: step.stepOrder,
        stepName: step.name,
        workflow: workflow.name,
      },
    });
  } catch { /* activity logging is non-critical */ }

  if (decision === 'REJECTED') {
    await applyDecision({
      requestId,
      organizationId: orgId,
      userId,
      decision: 'REJECT',
      rationale: trimmed || `Rejected at approval step ${step.stepOrder}: ${step.name}`,
    });
    return { status: 'REJECTED' };
  }

  const next = getApprovalState(workflow, [...approvals, approval]);

  if (next.isComplete) {
    await applyDecision({
      requestId,
      organizationId: orgId,
      userId,
      decision: 'APPROVE',
      rationale: trimmed || `Completed approval workflow "${workflow.name}"`,
    });
    return { status: 'APPROVED' };
  }

  if (next.currentStep) {
    await notifyStepApprovers({
      organizationId: request.organizationId,
      step: next.currentStep,
      requestId,
      requestTitle: request.title,
      actorId: userId,
    });
  }

  return { status: 'RECORDED' };
}

/**
 * Skip the chain for a high-scoring request.
 *
 * Acts as the org's first ADMIN — decisions.user_id is NOT NULL and the
 * requester is the wrong actor to attribute an approval of their own request
 * to. No admin, no auto-approval.
 */
export async function maybeAutoApprove(request: FeatureRequest): Promise<boolean> {
  if (request.status !== 'UNDER_REVIEW' || request.priorityScore === null) return false;

  const workflow = await getActiveWorkflow(request.organizationId);
  const threshold = workflow?.autoApproveMinPriority;
  if (threshold === null || threshold === undefined) return false;
  if (request.priorityScore < threshold) return false;

  const members = await getOrganizationUsers(request.organizationId);
  const admin = members.find((m) => m.role === 'ADMIN');
  if (!admin) return false;

  await applyDecision({
    requestId: request.id,
    organizationId: request.organizationId,
    userId: admin.userId,
    decision: 'APPROVE',
    rationale: `Auto-approved: priority ≥ ${threshold}`,
  });
  return true;
}
