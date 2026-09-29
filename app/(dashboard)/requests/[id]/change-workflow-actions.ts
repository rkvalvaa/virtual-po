"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { requireAuth } from "@/lib/auth/session"
import { transitionWorkflow, WorkflowError } from "@/lib/workflows/transition"
import { replayDelivery } from "@/lib/export/delivery"

const input = z.object({
  requestId: z.uuid(),
  expectedState: z.string().max(40),
  to: z.string().max(40),
  fields: z.record(z.string().max(60), z.string().max(10_000)).optional(),
  reason: z.string().max(10_000).optional(),
})

/** Queue a stuck or failed Linear delivery again; replayDelivery checks the reviewer role. */
export async function replayChangeDelivery(requestId: string): Promise<{ error?: string }> {
  const session = await requireAuth()
  if (!z.uuid().safeParse(requestId).success) return { error: "Invalid request." }
  try {
    await replayDelivery(requestId, session.user.orgId, session.user.id)
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to replay the delivery." }
  }
  revalidatePath(`/requests/${requestId}`)
  return {}
}

/** Move a change request; transitionWorkflow re-checks role, state and details. */
export async function moveChangeRequest(raw: z.input<typeof input>): Promise<{ error?: string }> {
  const session = await requireAuth()
  const parsed = input.safeParse(raw)
  if (!parsed.success) return { error: "Invalid request." }
  try {
    await transitionWorkflow({ ...parsed.data, organizationId: session.user.orgId, userId: session.user.id })
  } catch (error) {
    if (error instanceof WorkflowError) return { error: error.message }
    throw error
  }
  revalidatePath(`/requests/${parsed.data.requestId}`)
  return {}
}
