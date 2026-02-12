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
import { dispatchWebhookEvent } from "@/lib/api/webhooks"
import { API_KEY_SCOPES, WEBHOOK_EVENTS } from "@/lib/types/database"
import type { ApiKeyScope, WebhookEvent } from "@/lib/types/database"
import crypto from "node:crypto"
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
): Promise<{ success: boolean; error?: string }> {
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
    return { success: true }
  } catch {
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
  } catch {
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
): Promise<{ success: boolean; error?: string }> {
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

    dispatchWebhookEvent(orgId, "request.created", {
      test: true,
      message: "This is a test webhook delivery",
      timestamp: new Date().toISOString(),
    })

    return { success: true }
  } catch {
    return { success: false, error: "Failed to send test webhook." }
  }
}
