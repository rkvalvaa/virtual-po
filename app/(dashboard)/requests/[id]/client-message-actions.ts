"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { requireAuth } from "@/lib/auth/session"
import { canAccess } from "@/lib/auth/rbac"
import { MAX_MESSAGE_LENGTH, sendClientMessage } from "@/lib/db/queries/client-messages"

const input = z.object({ requestId: z.uuid(), body: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH) })

/** Message the client who submitted this portal request. */
export async function sendMessageToClient(requestId: string, body: string): Promise<{ success: boolean; error?: string }> {
  const session = await requireAuth()
  if (!canAccess(session.user.role, "REVIEWER")) return { success: false, error: "Only reviewers and administrators can message clients." }
  const parsed = input.safeParse({ requestId, body })
  if (!parsed.success) return { success: false, error: `Write a message of 1 to ${MAX_MESSAGE_LENGTH} characters.` }
  try {
    await sendClientMessage(session.user.orgId, session.user.id, parsed.data.requestId, parsed.data.body)
    revalidatePath(`/requests/${requestId}`)
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unable to send the message." }
  }
}
