"use server"

import { revalidatePath } from "next/cache"
import { requireAuth } from "@/lib/auth/session"
import { upsertEmailPreference } from "@/lib/db/queries/email-preferences"
import type { NotificationType } from "@/lib/types/database"
import "@/lib/auth/types"

export async function toggleEmailPreference(
  notificationType: NotificationType,
  enabled: boolean
) {
  const session = await requireAuth()
  const orgId = session.user.orgId
  if (!orgId) throw new Error("No organization")

  await upsertEmailPreference(
    session.user.id,
    orgId,
    notificationType,
    enabled
  )

  revalidatePath("/settings")
}
