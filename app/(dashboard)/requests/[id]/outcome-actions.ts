"use server"

import { revalidatePath } from "next/cache"
import { requireAuth } from "@/lib/auth/session"
import { canAccess } from "@/lib/auth/rbac"
import { recordDecisionOutcome, recordActualComplexity } from "@/lib/db/queries/outcomes"
import { logActivity } from "@/lib/db/queries/activity-log"
import { getDecisionById } from "@/lib/db/queries/decisions"
import { transaction } from '@/lib/db/pool'
import { lockActiveMemberRequest } from '@/lib/db/queries/request-access'
import "@/lib/auth/types"
import type { UserRole, DecisionOutcome, Complexity } from "@/lib/types/database"

export async function submitOutcome(
  decisionId: string,
  outcome: DecisionOutcome,
  notes?: string
) {
  const session = await requireAuth()

  if (!canAccess(session.user.role as UserRole, "REVIEWER")) {
    throw new Error("Insufficient permissions: REVIEWER role required")
  }

  await transaction(async () => {
    const decision = await getDecisionById(decisionId)
    if (!decision) throw new Error('Decision not found.')
    await lockActiveMemberRequest(decision.requestId, session.user.orgId, session.user.id, true)
    await recordDecisionOutcome(decisionId, outcome, notes)
  })

  try {
    const decision = await getDecisionById(decisionId);
    await logActivity({
      organizationId: session.user.orgId!,
      requestId: decision?.requestId ?? null,
      userId: session.user.id,
      action: 'DECISION_MADE',
      entityType: 'DECISION',
      entityId: decisionId,
      metadata: { outcome, notes: notes ?? null, type: 'outcome_recorded' },
    });
  } catch { /* activity logging is non-critical */ }

  revalidatePath("/requests")
  revalidatePath("/review")

  return { success: true }
}

export async function submitActualComplexity(
  requestId: string,
  actualComplexity: Complexity,
  actualEffortDays?: number,
  lessonsLearned?: string
) {
  const session = await requireAuth()

  if (!canAccess(session.user.role as UserRole, "REVIEWER")) {
    throw new Error("Insufficient permissions: REVIEWER role required")
  }

  await transaction(async () => {
    await lockActiveMemberRequest(requestId, session.user.orgId, session.user.id, true)
    await recordActualComplexity(requestId, actualComplexity, actualEffortDays, lessonsLearned)
  })

  try {
    await logActivity({
      organizationId: session.user.orgId!,
      requestId,
      userId: session.user.id,
      action: 'REQUEST_UPDATED',
      entityType: 'REQUEST',
      entityId: requestId,
      metadata: {
        actualComplexity,
        actualEffortDays: actualEffortDays ?? null,
        lessonsLearned: lessonsLearned ?? null,
        type: 'actual_complexity_recorded',
      },
    });
  } catch { /* activity logging is non-critical */ }

  revalidatePath("/requests/" + requestId)
  revalidatePath("/review")

  return { success: true }
}
