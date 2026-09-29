"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { requireAuth } from "@/lib/auth/session"
import { claimRequest, moveRequestToGroup, reassignRequest } from "@/lib/db/queries/group-queue"

type Result = { error?: string }

const reassignInput = z.object({ requestId: z.uuid(), expectedAssigneeId: z.uuid().nullable(), toUserId: z.uuid(), reason: z.string().max(1000) })
const moveInput = z.object({ requestId: z.uuid(), expectedGroupId: z.uuid(), toGroupId: z.uuid(), reason: z.string().max(1000) })

/** Every rule (membership, lead or admin, reason, what the person saw) is checked in lib/db/queries/group-queue. */
async function run(work: (scope: { orgId: string; userId: string }) => Promise<void>): Promise<Result> {
  const session = await requireAuth()
  try {
    await work({ orgId: session.user.orgId, userId: session.user.id })
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Unable to update the queue." }
  }
  revalidatePath("/queue")
  return {}
}

export async function claimQueueRequest(requestId: string): Promise<Result> {
  if (!z.uuid().safeParse(requestId).success) return { error: "Invalid request." }
  return run(scope => claimRequest({ ...scope, requestId }))
}

export async function reassignQueueRequest(input: z.input<typeof reassignInput>): Promise<Result> {
  const parsed = reassignInput.safeParse(input)
  if (!parsed.success) return { error: "Choose a member and give a reason." }
  return run(scope => reassignRequest({ ...scope, ...parsed.data }))
}

export async function moveQueueRequest(input: z.input<typeof moveInput>): Promise<Result> {
  const parsed = moveInput.safeParse(input)
  if (!parsed.success) return { error: "Choose a group and give a reason." }
  return run(scope => moveRequestToGroup({ ...scope, ...parsed.data }))
}
