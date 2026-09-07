"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { requireAuth } from "@/lib/auth/session"
import { submitStepApproval } from "@/lib/approvals/engine"
import { APPROVAL_DECISIONS, type UserRole } from "@/lib/types/database"
import "@/lib/auth/types"

const schema = z.object({
  requestId: z.uuid(),
  decision: z.enum(APPROVAL_DECISIONS),
  rationale: z.string().max(5000),
})

export async function submitStepApprovalAction(
  requestId: string,
  decision: string,
  rationale: string
): Promise<{ success: boolean; error?: string }> {
  const session = await requireAuth()

  const parsed = schema.safeParse({ requestId, decision, rationale })
  if (!parsed.success) {
    return { success: false, error: "Invalid approval input." }
  }

  try {
    await submitStepApproval({
      requestId: parsed.data.requestId,
      orgId: session.user.orgId,
      userId: session.user.id,
      role: session.user.role as UserRole,
      decision: parsed.data.decision,
      rationale: parsed.data.rationale,
    })
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to record approval.",
    }
  }

  revalidatePath(`/requests/${parsed.data.requestId}`)
  revalidatePath("/review")

  return { success: true }
}
