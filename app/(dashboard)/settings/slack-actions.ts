"use server"

import { requireAuth } from "@/lib/auth/session"
import { revalidatePath } from "next/cache"
import {
  getIntegrationByType,
  upsertIntegration,
  deactivateIntegration,
} from "@/lib/db/queries/jira-sync"
import {
  upsertSlackNotification,
  deleteSlackNotification,
} from "@/lib/db/queries/slack"
import { getSlackClientFromIntegration } from "@/lib/slack/client"
import { canAccess } from "@/lib/auth/rbac"
import { SLACK_EVENT_TYPES } from "@/lib/types/database"
import type { SlackEventType } from "@/lib/types/database"
import "@/lib/auth/types"

export async function connectSlack(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  const session = await requireAuth()

  if (!canAccess(session.user.role, "ADMIN")) {
    return { success: false, error: "Only admins can connect Slack." }
  }

  const orgId = session.user.orgId
  if (!orgId) {
    return { success: false, error: "No organization found." }
  }

  const botToken = formData.get("botToken") as string | null
  const signingSecret = formData.get("signingSecret") as string | null
  const appId = formData.get("appId") as string | null

  if (!botToken || !signingSecret || !appId) {
    return {
      success: false,
      error: "Bot Token, Signing Secret, and App ID are required.",
    }
  }

  try {
    await upsertIntegration(orgId, "SLACK", "Slack", {
      botToken,
      signingSecret,
      appId,
    })

    revalidatePath("/settings")
    return { success: true }
  } catch {
    return {
      success: false,
      error: "Failed to connect Slack. Please check your credentials.",
    }
  }
}

export async function disconnectSlack(): Promise<{
  success: boolean
  error?: string
}> {
  const session = await requireAuth()

  if (!canAccess(session.user.role, "ADMIN")) {
    return { success: false, error: "Only admins can disconnect Slack." }
  }

  const orgId = session.user.orgId
  if (!orgId) {
    return { success: false, error: "No organization found." }
  }

  try {
    const integration = await getIntegrationByType(orgId, "SLACK")
    if (!integration) {
      return { success: false, error: "No Slack integration found." }
    }

    await deactivateIntegration(integration.id)
    revalidatePath("/settings")
    return { success: true }
  } catch {
    return { success: false, error: "Failed to disconnect Slack." }
  }
}

export async function testSlackConnection(): Promise<{
  success: boolean
  channels?: Array<{ id: string; name: string }>
  error?: string
}> {
  const session = await requireAuth()

  if (!canAccess(session.user.role, "ADMIN")) {
    return {
      success: false,
      error: "Only admins can test the Slack connection.",
    }
  }

  const orgId = session.user.orgId
  if (!orgId) {
    return { success: false, error: "No organization found." }
  }

  try {
    const integration = await getIntegrationByType(orgId, "SLACK")
    if (!integration) {
      return { success: false, error: "No Slack integration found." }
    }

    const client = getSlackClientFromIntegration(integration)
    const channels = await client.getChannels()
    return { success: true, channels }
  } catch {
    return {
      success: false,
      error: "Failed to connect to Slack. Please check your credentials.",
    }
  }
}

export async function addNotificationConfig(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  const session = await requireAuth()

  if (!canAccess(session.user.role, "REVIEWER")) {
    return { success: false, error: "Insufficient permissions." }
  }

  const orgId = session.user.orgId
  if (!orgId) {
    return { success: false, error: "No organization found." }
  }

  const channelId = formData.get("channelId") as string | null
  const channelName = formData.get("channelName") as string | null
  const eventType = formData.get("eventType") as string | null

  if (!channelId || !channelName || !eventType) {
    return {
      success: false,
      error: "Channel ID, Channel Name, and Event Type are required.",
    }
  }

  const validEventTypes: readonly string[] = SLACK_EVENT_TYPES
  if (!validEventTypes.includes(eventType)) {
    return { success: false, error: "Invalid event type." }
  }

  try {
    await upsertSlackNotification(orgId, channelId, channelName, eventType as SlackEventType)
    revalidatePath("/settings")
    return { success: true }
  } catch {
    return {
      success: false,
      error: "Failed to add notification configuration.",
    }
  }
}

export async function removeNotificationConfig(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const session = await requireAuth()

  if (!canAccess(session.user.role, "REVIEWER")) {
    return { success: false, error: "Insufficient permissions." }
  }

  try {
    await deleteSlackNotification(id)
    revalidatePath("/settings")
    return { success: true }
  } catch {
    return {
      success: false,
      error: "Failed to remove notification configuration.",
    }
  }
}
