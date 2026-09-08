"use server"

import { requireAuth } from "@/lib/auth/session"
import {
  findSimilarRequests,
  type SimilarRequest,
} from "@/lib/db/queries/feature-requests"
import { createDraft } from "@/lib/db/queries/drafts"
import { z } from "zod"
import { seedDefaultTemplates } from "@/lib/db/queries/templates"
import { logActivity } from "@/lib/db/queries/activity-log"

export async function createNewRequest(params: {
  idempotencyKey: string
  title?: string
  templateId?: string
  promptHints?: string[]
}) {
  const session = await requireAuth()
  const orgId = session.user.orgId
  if (!orgId) {
    throw new Error("User has no organization")
  }

  const idempotencyKey = z.uuid().parse(params.idempotencyKey)
  const title = z.string().trim().min(1).max(200).parse(params.title?.trim() || "New Feature Request")
  const draft = await createDraft({ orgId, userId: session.user.id, title, idempotencyKey })

  try {
    if (draft.created) await logActivity({
      organizationId: orgId,
      requestId: draft.requestId,
      userId: session.user.id,
      action: 'REQUEST_CREATED',
      entityType: 'REQUEST',
      entityId: draft.requestId,
      metadata: { title },
    });
  } catch { /* activity logging is non-critical */ }

  return {
    requestId: draft.requestId,
    conversationId: draft.conversationId,
    promptHints: params?.promptHints ?? [],
  }
}

export async function findSimilarToTitle(title: string): Promise<SimilarRequest[]> {
  if (!title.trim()) return []
  const session = await requireAuth()
  const orgId = session.user.orgId
  if (!orgId) return []
  return findSimilarRequests(orgId, title)
}

export async function ensureDefaultTemplates() {
  const session = await requireAuth()
  const orgId = session.user.orgId
  if (!orgId) {
    throw new Error("User has no organization")
  }
  await seedDefaultTemplates(orgId)
}
