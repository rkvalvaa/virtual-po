"use server"

import { requireAuth } from "@/lib/auth/session"
import { createFeatureRequest } from "@/lib/db/queries/feature-requests"
import { createConversation } from "@/lib/db/queries/conversations"
import { seedDefaultTemplates } from "@/lib/db/queries/templates"
import { logActivity } from "@/lib/db/queries/activity-log"

export async function createNewRequest(params?: {
  title?: string
  templateId?: string
  promptHints?: string[]
}) {
  const session = await requireAuth()
  const orgId = session.user.orgId
  if (!orgId) {
    throw new Error("User has no organization")
  }

  const title = params?.title || "New Feature Request"

  const request = await createFeatureRequest(
    orgId,
    session.user.id,
    title
  )
  const conversation = await createConversation(request.id, "INTAKE")

  try {
    await logActivity({
      organizationId: orgId,
      requestId: request.id,
      userId: session.user.id,
      action: 'REQUEST_CREATED',
      entityType: 'REQUEST',
      entityId: request.id,
      metadata: { title },
    });
  } catch { /* activity logging is non-critical */ }

  return {
    requestId: request.id,
    conversationId: conversation.id,
    promptHints: params?.promptHints ?? [],
  }
}

export async function ensureDefaultTemplates() {
  const session = await requireAuth()
  const orgId = session.user.orgId
  if (!orgId) {
    throw new Error("User has no organization")
  }
  await seedDefaultTemplates(orgId)
}
