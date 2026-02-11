"use server"

import { requireAuth } from "@/lib/auth/session"
import { createFeatureRequest } from "@/lib/db/queries/feature-requests"
import { createConversation } from "@/lib/db/queries/conversations"

export async function createNewRequest() {
  const session = await requireAuth()
  const orgId = session.user.orgId
  if (!orgId) {
    throw new Error("User has no organization")
  }

  const request = await createFeatureRequest(
    orgId,
    session.user.id,
    "New Feature Request"
  )
  const conversation = await createConversation(request.id, "INTAKE")

  return { requestId: request.id, conversationId: conversation.id }
}
