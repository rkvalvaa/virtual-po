"use server"

import { revalidatePath } from "next/cache"
import { requireAuth } from "@/lib/auth/session"
import { upsertEmailPreference } from "@/lib/db/queries/email-preferences"
import type { NotificationType } from "@/lib/types/database"
import { z } from "zod"
import { enqueueAdminTestEmail, listEmailDeliveries, processEmailOutbox, retryEmailDelivery } from "@/lib/email/outbox"
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

export async function sendEmailTestAction(): Promise<{
  success: boolean
  deliveryId?: string
  status?: string
  error?: string
}> {
  const session = await requireAuth()
  if (session.user.role !== 'ADMIN' || !session.user.orgId) {
    return { success: false, error: 'Only current workspace admins can test email delivery.' }
  }

  try {
    const delivery = await enqueueAdminTestEmail(session.user.orgId, session.user.id)
    await processEmailOutbox({ orgId: session.user.orgId, deliveryId: delivery.id, limit: 1 })
    const latest = (await listEmailDeliveries(session.user.orgId)).find(item => item.id === delivery.id) ?? delivery
    revalidatePath('/settings')
    if (latest.status === 'ACCEPTED') return { success: true, deliveryId: delivery.id, status: latest.status }
    return {
      success: false,
      deliveryId: delivery.id,
      status: latest.status,
      error: latest.errorMessage ?? `Test email is ${latest.status.toLowerCase()}. Its status is saved for retry.`,
    }
  } catch {
    return { success: false, error: 'Unable to queue the email test. Try again.' }
  }
}

export async function retryEmailDeliveryAction(deliveryId: string): Promise<{ success: boolean; error?: string }> {
  const session = await requireAuth()
  if (session.user.role !== 'ADMIN' || !session.user.orgId || !z.uuid().safeParse(deliveryId).success) {
    return { success: false, error: 'Admin access and a valid email delivery are required.' }
  }
  try {
    const queued = await retryEmailDelivery(session.user.orgId, deliveryId, session.user.id)
    if (!queued) return { success: false, error: 'Only failed or unavailable deliveries can be retried after email is configured.' }
    revalidatePath('/settings')
    return { success: true }
  } catch {
    return { success: false, error: 'Unable to queue the email retry. Try again.' }
  }
}
