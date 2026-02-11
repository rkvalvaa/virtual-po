"use server"

import { requireAuth } from "@/lib/auth/session"
import {
  createObjective,
  updateObjective,
  deleteObjective,
  createKeyResult,
  updateKeyResult,
  deleteKeyResult,
} from "@/lib/db/queries/okrs"
import { upsertCapacity } from "@/lib/db/queries/capacity"
import { revalidatePath } from "next/cache"
import "@/lib/auth/types"

export async function createOkrObjective(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  const session = await requireAuth()
  if (session.user.role !== "ADMIN" && session.user.role !== "REVIEWER") {
    return { success: false, error: "Insufficient permissions." }
  }
  const orgId = session.user.orgId
  if (!orgId) {
    return { success: false, error: "No organization found." }
  }

  const title = formData.get("title") as string
  const description = (formData.get("description") as string) || null
  const timeFrame = formData.get("timeFrame") as string

  if (!title || !timeFrame) {
    return { success: false, error: "Title and time frame are required." }
  }

  try {
    await createObjective(orgId, title, description, timeFrame, session.user.id)
    revalidatePath("/settings")
    return { success: true }
  } catch {
    return { success: false, error: "Failed to create objective." }
  }
}

export async function updateOkrObjective(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  const session = await requireAuth()
  if (session.user.role !== "ADMIN" && session.user.role !== "REVIEWER") {
    return { success: false, error: "Insufficient permissions." }
  }

  const id = formData.get("id") as string
  const title = formData.get("title") as string | undefined
  const description = formData.get("description") as string | undefined
  const timeFrame = formData.get("timeFrame") as string | undefined
  const status = formData.get("status") as string | undefined

  if (!id) {
    return { success: false, error: "Objective ID is required." }
  }

  try {
    await updateObjective(id, {
      title: title || undefined,
      description: description ?? undefined,
      timeFrame: timeFrame || undefined,
      status: status as "ACTIVE" | "COMPLETED" | "CANCELLED" | undefined,
    })
    revalidatePath("/settings")
    return { success: true }
  } catch {
    return { success: false, error: "Failed to update objective." }
  }
}

export async function deleteOkrObjective(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const session = await requireAuth()
  if (session.user.role !== "ADMIN" && session.user.role !== "REVIEWER") {
    return { success: false, error: "Insufficient permissions." }
  }

  try {
    await deleteObjective(id)
    revalidatePath("/settings")
    return { success: true }
  } catch {
    return { success: false, error: "Failed to delete objective." }
  }
}

export async function createOkrKeyResult(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  const session = await requireAuth()
  if (session.user.role !== "ADMIN" && session.user.role !== "REVIEWER") {
    return { success: false, error: "Insufficient permissions." }
  }

  const objectiveId = formData.get("objectiveId") as string
  const title = formData.get("title") as string
  const targetValue = Number(formData.get("targetValue"))
  const unit = formData.get("unit") as string

  if (!objectiveId || !title || !targetValue || !unit) {
    return { success: false, error: "All fields are required." }
  }

  try {
    await createKeyResult(objectiveId, title, targetValue, unit)
    revalidatePath("/settings")
    return { success: true }
  } catch {
    return { success: false, error: "Failed to create key result." }
  }
}

export async function updateOkrKeyResult(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  const session = await requireAuth()
  if (session.user.role !== "ADMIN" && session.user.role !== "REVIEWER") {
    return { success: false, error: "Insufficient permissions." }
  }

  const id = formData.get("id") as string
  const currentValue = formData.get("currentValue")
  const title = formData.get("title") as string | undefined
  const targetValue = formData.get("targetValue")
  const unit = formData.get("unit") as string | undefined

  if (!id) {
    return { success: false, error: "Key result ID is required." }
  }

  try {
    await updateKeyResult(id, {
      title: title || undefined,
      targetValue: targetValue ? Number(targetValue) : undefined,
      currentValue: currentValue !== null ? Number(currentValue) : undefined,
      unit: unit || undefined,
    })
    revalidatePath("/settings")
    return { success: true }
  } catch {
    return { success: false, error: "Failed to update key result." }
  }
}

export async function deleteOkrKeyResult(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const session = await requireAuth()
  if (session.user.role !== "ADMIN" && session.user.role !== "REVIEWER") {
    return { success: false, error: "Insufficient permissions." }
  }

  try {
    await deleteKeyResult(id)
    revalidatePath("/settings")
    return { success: true }
  } catch {
    return { success: false, error: "Failed to delete key result." }
  }
}

export async function updateTeamCapacity(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  const session = await requireAuth()
  if (session.user.role !== "ADMIN") {
    return { success: false, error: "Only admins can update team capacity." }
  }
  const orgId = session.user.orgId
  if (!orgId) {
    return { success: false, error: "No organization found." }
  }

  const quarter = formData.get("quarter") as string
  const totalCapacityDays = Number(formData.get("totalCapacityDays"))
  const allocatedDays = Number(formData.get("allocatedDays"))
  const notes = (formData.get("notes") as string) || null

  if (!quarter || isNaN(totalCapacityDays) || isNaN(allocatedDays)) {
    return { success: false, error: "Quarter and capacity values are required." }
  }

  try {
    await upsertCapacity(
      orgId,
      quarter,
      totalCapacityDays,
      allocatedDays,
      notes,
      session.user.id
    )
    revalidatePath("/settings")
    return { success: true }
  } catch {
    return { success: false, error: "Failed to update team capacity." }
  }
}
