"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { requireAuth } from "@/lib/auth/session"
import {
  createWorkflow,
  deleteWorkflow,
  getWorkflowById,
  replaceSteps,
  updateWorkflow,
} from "@/lib/db/queries/approval-workflows"
import { APPROVER_ROLES } from "@/lib/types/database"
import "@/lib/auth/types"

const stepSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    approverRole: z.enum(APPROVER_ROLES).nullable(),
    approverUserId: z.uuid().nullable(),
  })
  // Mirrors the approval_steps_one_approver CHECK: exactly one approver.
  .refine((s) => (s.approverRole === null) !== (s.approverUserId === null), {
    message: "Each step needs either a role or a specific approver, not both",
  })

const saveSchema = z.object({
  workflowId: z.uuid().nullable(),
  name: z.string().trim().min(1).max(200),
  isActive: z.boolean(),
  autoApproveMinPriority: z.number().min(0).max(100).nullable(),
  steps: z.array(stepSchema).max(20),
})

export type SaveApprovalWorkflowInput = z.input<typeof saveSchema>

/**
 * Create or update the org's approval workflow and replace its steps.
 *
 * One action rather than three: the settings form always submits the whole
 * workflow, and splitting it would let the steps and the active flag disagree.
 */
export async function saveApprovalWorkflow(
  input: SaveApprovalWorkflowInput
): Promise<{ success: boolean; error?: string }> {
  const session = await requireAuth()
  if (session.user.role !== "ADMIN") {
    return { success: false, error: "Insufficient permissions: ADMIN required." }
  }
  const orgId = session.user.orgId
  if (!orgId) {
    return { success: false, error: "No organization found." }
  }

  const parsed = saveSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid workflow.",
    }
  }
  const { workflowId, name, isActive, autoApproveMinPriority, steps } = parsed.data

  if (isActive && steps.length === 0 && autoApproveMinPriority === null) {
    return {
      success: false,
      error: "An active workflow needs at least one step or an auto-approve threshold.",
    }
  }

  try {
    let id = workflowId
    if (id) {
      const existing = await getWorkflowById(orgId, id)
      if (!existing) return { success: false, error: "Workflow not found." }
      await updateWorkflow(orgId, id, { name, isActive, autoApproveMinPriority })
    } else {
      const created = await createWorkflow(orgId, name, autoApproveMinPriority)
      id = created.id
      if (isActive) await updateWorkflow(orgId, id, { isActive: true })
    }

    await replaceSteps(orgId, id, steps)
    revalidatePath("/settings")
    return { success: true }
  } catch {
    return { success: false, error: "Failed to save approval workflow." }
  }
}

export async function deleteApprovalWorkflow(
  workflowId: string
): Promise<{ success: boolean; error?: string }> {
  const session = await requireAuth()
  if (session.user.role !== "ADMIN") {
    return { success: false, error: "Insufficient permissions: ADMIN required." }
  }
  const orgId = session.user.orgId
  if (!orgId) {
    return { success: false, error: "No organization found." }
  }

  const parsed = z.uuid().safeParse(workflowId)
  if (!parsed.success) {
    return { success: false, error: "Invalid workflow id." }
  }

  try {
    await deleteWorkflow(orgId, parsed.data)
    revalidatePath("/settings")
    return { success: true }
  } catch {
    return { success: false, error: "Failed to delete approval workflow." }
  }
}
