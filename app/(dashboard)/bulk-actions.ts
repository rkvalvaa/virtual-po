"use server"

import { revalidatePath } from "next/cache"
import { requireAuth } from "@/lib/auth/session"
import { canAccess } from "@/lib/auth/rbac"
import { canTransition } from "@/lib/utils/workflow"
import {
  getFeatureRequestById,
  updateFeatureRequestStatus,
  updateFeatureRequest,
} from "@/lib/db/queries/feature-requests"
import type { RequestStatus, UserRole } from "@/lib/types/database"
import "@/lib/auth/types"

export async function bulkUpdateStatus(
  requestIds: string[],
  targetStatus: RequestStatus
) {
  const session = await requireAuth()

  if (!canAccess(session.user.role as UserRole, "REVIEWER")) {
    throw new Error("Insufficient permissions: REVIEWER role required")
  }

  const results: { id: string; success: boolean; error?: string }[] = []

  for (const id of requestIds) {
    const request = await getFeatureRequestById(id)
    if (!request || request.organizationId !== session.user.orgId) {
      results.push({ id, success: false, error: "Not found" })
      continue
    }
    if (!canTransition(request.status, targetStatus)) {
      results.push({
        id,
        success: false,
        error: `Cannot transition from ${request.status}`,
      })
      continue
    }
    await updateFeatureRequestStatus(id, targetStatus)
    results.push({ id, success: true })
  }

  revalidatePath("/requests")
  revalidatePath("/review")
  revalidatePath("/backlog")

  return results
}

export async function bulkAddTags(requestIds: string[], tags: string[]) {
  const session = await requireAuth()

  if (!canAccess(session.user.role as UserRole, "REVIEWER")) {
    throw new Error("Insufficient permissions: REVIEWER role required")
  }

  for (const id of requestIds) {
    const request = await getFeatureRequestById(id)
    if (!request || request.organizationId !== session.user.orgId) continue
    const existingTags = request.tags ?? []
    const merged = [...new Set([...existingTags, ...tags])]
    await updateFeatureRequest(id, { tags: merged })
  }

  revalidatePath("/requests")
  revalidatePath("/review")
  revalidatePath("/backlog")
}

export async function bulkRemoveTags(requestIds: string[], tags: string[]) {
  const session = await requireAuth()

  if (!canAccess(session.user.role as UserRole, "REVIEWER")) {
    throw new Error("Insufficient permissions: REVIEWER role required")
  }

  const tagSet = new Set(tags)

  for (const id of requestIds) {
    const request = await getFeatureRequestById(id)
    if (!request || request.organizationId !== session.user.orgId) continue
    const filtered = (request.tags ?? []).filter((t) => !tagSet.has(t))
    await updateFeatureRequest(id, { tags: filtered })
  }

  revalidatePath("/requests")
  revalidatePath("/review")
  revalidatePath("/backlog")
}
