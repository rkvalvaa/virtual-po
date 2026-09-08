"use server"

import { requireAuth } from "@/lib/auth/session"
import { revalidatePath } from "next/cache"
import { canAccess } from "@/lib/auth/rbac"
import { generateApiKey } from "@/lib/api/auth"
import {
  createApiKey as dbCreateApiKey,
  getApiKeysByOrg,
  revokeApiKey as dbRevokeApiKey,
} from "@/lib/db/queries/api-keys"
import {
  createWebhookSubscription,
  getWebhooksByOrg,
  updateWebhookSubscription,
  deleteWebhookSubscription as dbDeleteWebhook,
} from "@/lib/db/queries/webhooks"
import { enqueueWebhookTest, listWebhookDeliveries, processWebhookOutbox, redeliverWebhook } from "@/lib/api/webhook-outbox"
import { query, transaction } from "@/lib/db/pool"
import { z } from "zod"
import { API_KEY_SCOPES, WEBHOOK_EVENTS } from "@/lib/types/database"
import type { ApiKeyScope, WebhookEvent } from "@/lib/types/database"
import crypto from "node:crypto"
import { InvalidWebhookDestination } from "@/lib/api/webhook-destination"
import "@/lib/auth/types"

export async function createApiKeyAction(
  name: string,
  scopes: string[]
): Promise<{ success: boolean; key?: string; error?: string }> {
  const session = await requireAuth()

  if (!canAccess(session.user.role, "ADMIN")) {
    return { success: false, error: "Only admins can create API keys." }
  }

  const orgId = session.user.orgId
  if (!orgId) {
    return { success: false, error: "No organization found." }
  }

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return { success: false, error: "Name is required." }
  }

  const validScopes: readonly string[] = API_KEY_SCOPES
  for (const scope of scopes) {
    if (!validScopes.includes(scope)) {
      return { success: false, error: `Invalid scope: ${scope}` }
    }
  }

  try {
    const { key, hash, prefix } = generateApiKey()

    await dbCreateApiKey(
      orgId,
      name.trim(),
      hash,
      prefix,
      scopes as ApiKeyScope[],
      session.user.id!
    )

    revalidatePath("/settings")
    // Return the full key ONE TIME - it cannot be retrieved again
    return { success: true, key }
  } catch {
    return { success: false, error: "Failed to create API key." }
  }
}

export async function revokeApiKeyAction(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const session = await requireAuth()

  if (!canAccess(session.user.role, "ADMIN")) {
    return { success: false, error: "Only admins can revoke API keys." }
  }

  const orgId = session.user.orgId
  if (!orgId) {
    return { success: false, error: "No organization found." }
  }

  try {
    // Verify the API key belongs to this org
    const keys = await getApiKeysByOrg(orgId)
    const keyToRevoke = keys.find((k) => k.id === id)
    if (!keyToRevoke) {
      return { success: false, error: "API key not found." }
    }

    await dbRevokeApiKey(id)
    revalidatePath("/settings")
    return { success: true }
  } catch {
    return { success: false, error: "Failed to revoke API key." }
  }
}

export async function createWebhookAction(
  url: string,
  events: string[]
): Promise<{ success: boolean; secret?: string; error?: string }> {
  const session = await requireAuth()

  if (!canAccess(session.user.role, "ADMIN")) {
    return { success: false, error: "Only admins can create webhooks." }
  }

  const orgId = session.user.orgId
  if (!orgId) {
    return { success: false, error: "No organization found." }
  }

  if (!url || typeof url !== "string") {
    return { success: false, error: "URL is required." }
  }

  if (!events || !Array.isArray(events) || events.length === 0) {
    return { success: false, error: "At least one event is required." }
  }

  const validEvents: readonly string[] = WEBHOOK_EVENTS
  for (const event of events) {
    if (!validEvents.includes(event)) {
      return { success: false, error: `Invalid event: ${event}` }
    }
  }

  try {
    const secret = crypto.randomBytes(32).toString("hex")
    await createWebhookSubscription(orgId, url, secret, events as WebhookEvent[])
    revalidatePath("/settings")
    return { success: true, secret }
  } catch (error) {
    if (error instanceof InvalidWebhookDestination) return { success: false, error: error.message }
    return { success: false, error: "Failed to create webhook." }
  }
}

export async function updateWebhookAction(
  id: string,
  data: { url?: string; events?: string[]; isActive?: boolean }
): Promise<{ success: boolean; error?: string }> {
  const session = await requireAuth()

  if (!canAccess(session.user.role, "ADMIN")) {
    return { success: false, error: "Only admins can update webhooks." }
  }

  const orgId = session.user.orgId
  if (!orgId) {
    return { success: false, error: "No organization found." }
  }

  try {
    // Verify the webhook belongs to this org
    const webhooks = await getWebhooksByOrg(orgId)
    const webhook = webhooks.find((w) => w.id === id)
    if (!webhook) {
      return { success: false, error: "Webhook not found." }
    }

    if (data.events) {
      const validEvents: readonly string[] = WEBHOOK_EVENTS
      for (const event of data.events) {
        if (!validEvents.includes(event)) {
          return { success: false, error: `Invalid event: ${event}` }
        }
      }
    }

    await updateWebhookSubscription(id, {
      url: data.url,
      events: data.events as WebhookEvent[] | undefined,
      isActive: data.isActive,
    })

    revalidatePath("/settings")
    return { success: true }
  } catch (error) {
    if (error instanceof InvalidWebhookDestination) return { success: false, error: error.message }
    return { success: false, error: "Failed to update webhook." }
  }
}

export async function deleteWebhookAction(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const session = await requireAuth()

  if (!canAccess(session.user.role, "ADMIN")) {
    return { success: false, error: "Only admins can delete webhooks." }
  }

  const orgId = session.user.orgId
  if (!orgId) {
    return { success: false, error: "No organization found." }
  }

  try {
    const webhooks = await getWebhooksByOrg(orgId)
    const webhook = webhooks.find((w) => w.id === id)
    if (!webhook) {
      return { success: false, error: "Webhook not found." }
    }

    await dbDeleteWebhook(id)
    revalidatePath("/settings")
    return { success: true }
  } catch {
    return { success: false, error: "Failed to delete webhook." }
  }
}

export async function testWebhookAction(
  id: string
): Promise<{ success: boolean; deliveryId?: string; status?: string; error?: string }> {
  const session = await requireAuth()

  if (!canAccess(session.user.role, "ADMIN")) {
    return { success: false, error: "Only admins can test webhooks." }
  }

  const orgId = session.user.orgId
  if (!orgId) {
    return { success: false, error: "No organization found." }
  }

  try {
    const webhooks = await getWebhooksByOrg(orgId)
    const webhook = webhooks.find((w) => w.id === id)
    if (!webhook) {
      return { success: false, error: "Webhook not found." }
    }

    const deliveryId = await enqueueWebhookTest(orgId, id)
    await processWebhookOutbox({ orgId, deliveryId, limit: 1 })
    const delivery = (await listWebhookDeliveries(orgId, id)).find(item => item.id === deliveryId)
    revalidatePath("/settings")
    return { success: delivery?.status === "SUCCEEDED", deliveryId, status: delivery?.status ?? "PENDING",
      error: delivery?.status === "SUCCEEDED" ? undefined : `Test delivery ${delivery?.status?.toLowerCase() ?? "pending"}${delivery?.httpStatus ? ` (HTTP ${delivery.httpStatus})` : ""}. View delivery history for retry status.` }
  } catch {
    return { success: false, error: "Failed to send test webhook." }
  }
}

export async function webhookDeliveryHistoryAction(subscriptionId: string) {
  const session = await requireAuth()
  if (session.user.role !== "ADMIN" || !session.user.orgId || !z.uuid().safeParse(subscriptionId).success) {
    return { success: false as const, error: "Admin access and a valid webhook are required." }
  }
  return { success: true as const, deliveries: await listWebhookDeliveries(session.user.orgId, subscriptionId) }
}

export async function redeliverWebhookAction(deliveryId: string) {
  const session = await requireAuth()
  if (session.user.role !== "ADMIN" || !session.user.orgId || !z.uuid().safeParse(deliveryId).success) {
    return { success: false, error: "Admin access and a valid delivery are required." }
  }
  const queued = await redeliverWebhook(session.user.orgId, deliveryId)
  if (!queued) return { success: false, error: "Only failed or interrupted deliveries can be retried." }
  revalidatePath("/settings")
  return { success: true }
}

export async function rotateWebhookSecretAction(subscriptionId: string): Promise<{ success: boolean; secret?: string; error?: string }> {
  const session = await requireAuth()
  if (session.user.role !== "ADMIN" || !session.user.orgId || !z.uuid().safeParse(subscriptionId).success) {
    return { success: false, error: "Only admins can rotate webhook secrets." }
  }
  return transaction(async () => {
    const member = await query(`SELECT user_id FROM organization_users WHERE organization_id=$1 AND user_id=$2 AND role='ADMIN' FOR SHARE`, [session.user.orgId, session.user.id])
    if (!member.rows.length) return { success: false, error: "Admin membership is required." }
    const secret = crypto.randomBytes(32).toString("hex")
    const rotated = await query('UPDATE webhook_subscriptions SET secret=$3 WHERE id=$1 AND organization_id=$2 RETURNING id', [subscriptionId, session.user.orgId, secret])
    if (!rotated.rows.length) return { success: false, error: "Webhook not found." }
    return { success: true, secret }
  })
}
