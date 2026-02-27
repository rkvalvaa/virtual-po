"use server"

import { requireAuth } from "@/lib/auth/session"
import { revalidatePath } from "next/cache"
import {
  getIntegrationByType,
  upsertIntegration,
  deactivateIntegration,
} from "@/lib/db/queries/jira-sync"
import {
  upsertTeamsNotification,
  deleteTeamsNotification,
} from "@/lib/db/queries/teams"
import { postTextToTeams } from "@/lib/teams/client"
import { canAccess } from "@/lib/auth/rbac"
import { TEAMS_EVENT_TYPES } from "@/lib/types/database"
import type { TeamsEventType } from "@/lib/types/database"
import "@/lib/auth/types"

export async function connectTeams(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  const session = await requireAuth()

  if (!canAccess(session.user.role, "ADMIN")) {
    return { success: false, error: "Only admins can connect Teams." }
  }

  const orgId = session.user.orgId
  if (!orgId) {
    return { success: false, error: "No organization found." }
  }

  const webhookUrl = formData.get("webhookUrl") as string | null

  if (!webhookUrl) {
    return { success: false, error: "Webhook URL is required." }
  }

  // Validate URL format
  try {
    const url = new URL(webhookUrl)
    if (!url.hostname.endsWith('.webhook.office.com') && !url.hostname.endsWith('.logic.azure.com')) {
      return { success: false, error: "URL must be a valid Teams webhook URL." }
    }
  } catch {
    return { success: false, error: "Invalid webhook URL." }
  }

  try {
    // Test the webhook by sending a test message
    await postTextToTeams(webhookUrl, "Virtual Product Owner connected successfully! You will receive notifications in this channel.")

    await upsertIntegration(orgId, "TEAMS", "Microsoft Teams", {
      webhookUrl,
    })

    revalidatePath("/settings")
    return { success: true }
  } catch {
    return {
      success: false,
      error: "Failed to connect to Teams. Please check your webhook URL.",
    }
  }
}

export async function disconnectTeams(): Promise<{
  success: boolean
  error?: string
}> {
  const session = await requireAuth()

  if (!canAccess(session.user.role, "ADMIN")) {
    return { success: false, error: "Only admins can disconnect Teams." }
  }

  const orgId = session.user.orgId
  if (!orgId) {
    return { success: false, error: "No organization found." }
  }

  try {
    const integration = await getIntegrationByType(orgId, "TEAMS")
    if (!integration) {
      return { success: false, error: "No Teams integration found." }
    }

    await deactivateIntegration(integration.id)
    revalidatePath("/settings")
    return { success: true }
  } catch {
    return { success: false, error: "Failed to disconnect Teams." }
  }
}

export async function testTeamsConnection(): Promise<{
  success: boolean
  error?: string
}> {
  const session = await requireAuth()

  if (!canAccess(session.user.role, "ADMIN")) {
    return {
      success: false,
      error: "Only admins can test the Teams connection.",
    }
  }

  const orgId = session.user.orgId
  if (!orgId) {
    return { success: false, error: "No organization found." }
  }

  try {
    const integration = await getIntegrationByType(orgId, "TEAMS")
    if (!integration) {
      return { success: false, error: "No Teams integration found." }
    }

    const webhookUrl = integration.config.webhookUrl as string
    await postTextToTeams(webhookUrl, "Connection test successful! Your Teams integration is working.")
    return { success: true }
  } catch {
    return {
      success: false,
      error: "Failed to connect to Teams. Please check your webhook URL.",
    }
  }
}

export async function addTeamsNotificationConfig(
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

  const channelName = formData.get("channelName") as string | null
  const webhookUrl = formData.get("webhookUrl") as string | null
  const eventType = formData.get("eventType") as string | null

  if (!channelName || !webhookUrl || !eventType) {
    return {
      success: false,
      error: "Channel Name, Webhook URL, and Event Type are required.",
    }
  }

  const validEventTypes: readonly string[] = TEAMS_EVENT_TYPES
  if (!validEventTypes.includes(eventType)) {
    return { success: false, error: "Invalid event type." }
  }

  try {
    await upsertTeamsNotification(orgId, channelName, webhookUrl, eventType as TeamsEventType)
    revalidatePath("/settings")
    return { success: true }
  } catch {
    return {
      success: false,
      error: "Failed to add notification configuration.",
    }
  }
}

export async function removeTeamsNotificationConfig(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const session = await requireAuth()

  if (!canAccess(session.user.role, "REVIEWER")) {
    return { success: false, error: "Insufficient permissions." }
  }

  try {
    await deleteTeamsNotification(id)
    revalidatePath("/settings")
    return { success: true }
  } catch {
    return {
      success: false,
      error: "Failed to remove notification configuration.",
    }
  }
}
