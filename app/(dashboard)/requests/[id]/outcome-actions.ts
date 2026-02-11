"use server"

import { revalidatePath } from "next/cache"
import { requireAuth } from "@/lib/auth/session"
import { canAccess } from "@/lib/auth/rbac"
import { recordDecisionOutcome, recordActualComplexity } from "@/lib/db/queries/outcomes"
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

  await recordDecisionOutcome(decisionId, outcome, notes)

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

  await recordActualComplexity(requestId, actualComplexity, actualEffortDays, lessonsLearned)

  revalidatePath("/requests/" + requestId)
  revalidatePath("/review")

  return { success: true }
}
