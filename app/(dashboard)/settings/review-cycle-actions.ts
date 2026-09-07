"use server"

import { revalidatePath } from "next/cache"
import { requireAuth } from "@/lib/auth/session"
import {
  getOrganizationById,
  updateOrganization,
} from "@/lib/db/queries/organizations"
import { reviewCycleConfigSchema } from "@/lib/review-cycles/config"
import { runReviewCycle } from "@/lib/review-cycles/engine"
import "@/lib/auth/types"

export async function saveReviewCycleConfig(
  input: unknown
): Promise<{ success: boolean; error?: string }> {
  const session = await requireAuth()
  if (session.user.role !== "ADMIN") {
    return { success: false, error: "Insufficient permissions: ADMIN required." }
  }
  const orgId = session.user.orgId
  if (!orgId) {
    return { success: false, error: "No organization found." }
  }

  const parsed = reviewCycleConfigSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid review cycle settings.",
    }
  }

  try {
    // Read-modify-write: settings is a shared blob (scoring lives there too),
    // so the whole object has to go back, not just this key.
    const org = await getOrganizationById(orgId)
    if (!org) return { success: false, error: "Organization not found." }

    await updateOrganization(orgId, {
      settings: { ...org.settings, reviewCycle: parsed.data },
    })
    revalidatePath("/settings")
    return { success: true }
  } catch {
    return { success: false, error: "Failed to save review cycle settings." }
  }
}

export async function triggerReviewCycle(): Promise<{
  success: boolean
  error?: string
  requeuedCount?: number
}> {
  const session = await requireAuth()
  if (session.user.role !== "ADMIN") {
    return { success: false, error: "Insufficient permissions: ADMIN required." }
  }
  const orgId = session.user.orgId
  if (!orgId) {
    return { success: false, error: "No organization found." }
  }

  try {
    const cycle = await runReviewCycle({
      orgId,
      triggeredBy: "MANUAL",
      userId: session.user.id,
    })
    revalidatePath("/settings")
    revalidatePath("/review")
    return { success: true, requeuedCount: cycle.requeuedCount }
  } catch {
    return { success: false, error: "Failed to run the review cycle." }
  }
}
