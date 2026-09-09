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
  upsertTeamsTenant,
  bindTeamsIdentity,
} from "@/lib/db/queries/teams"
import { isTeamsWebhookUrl, postTextToTeams } from "@/lib/teams/client"
import { canAccess } from "@/lib/auth/rbac"
import { TEAMS_EVENT_TYPES } from "@/lib/types/database"
import type { TeamsEventType } from "@/lib/types/database"
import "@/lib/auth/types"
import { retryTeamsDelivery } from '@/lib/teams/outbox'
import { transaction } from '@/lib/db/pool'
import { z } from 'zod'

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
  const tenantId = formData.get("tenantId") as string | null

  if (!webhookUrl || !tenantId?.trim()) {
    return { success: false, error: "Webhook URL and Microsoft tenant ID are required." }
  }
  if (!z.uuid().safeParse(tenantId.trim()).success) return { success: false, error: 'Microsoft tenant ID must be a UUID.' }

  if (!isTeamsWebhookUrl(webhookUrl)) return { success: false, error: "URL must be a valid HTTPS Teams webhook URL." }

  try {
    // Test the webhook by sending a test message
    await postTextToTeams(webhookUrl, "Virtual Product Owner webhook connection test. Automatic notifications and bot commands are unavailable; create and track requests in the VPO web app.")

    await transaction(async () => {
      await upsertIntegration(orgId, "TEAMS", "Microsoft Teams", { webhookUrl })
      await upsertTeamsTenant(orgId, tenantId.trim())
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

export async function bindTeamsIdentityAction(formData: FormData): Promise<{ success: boolean; error?: string }> {
  const session = await requireAuth()
  if (!canAccess(session.user.role, 'ADMIN') || !session.user.orgId) return { success: false, error: 'Only admins can bind Teams identities.' }
  const tenantId = String(formData.get('tenantId') ?? '').trim()
  const teamsUserId = String(formData.get('teamsUserId') ?? '').trim()
  const userId = String(formData.get('userId') ?? '').trim()
  if (!tenantId || !teamsUserId || !userId) return { success: false, error: 'Tenant, Teams user, and VPO member are required.' }
  if (!z.uuid().safeParse(tenantId).success || !z.uuid().safeParse(userId).success || teamsUserId.length > 500) return { success: false, error: 'Invalid Teams identity binding.' }
  try {
    if (!await bindTeamsIdentity(session.user.orgId, tenantId, teamsUserId, userId)) return { success: false, error: 'Current workspace member not found.' }
    revalidatePath('/settings')
    return { success: true }
  } catch { return { success: false, error: 'Unable to bind that Teams identity.' } }
}

export async function retryTeamsDeliveryAction(id: string): Promise<{ success: boolean; error?: string }> {
  const session = await requireAuth()
  if (!canAccess(session.user.role, 'REVIEWER') || !session.user.orgId) return { success: false, error: 'Insufficient permissions.' }
  return await retryTeamsDelivery(session.user.orgId, id) ? { success: true } : { success: false, error: 'This Teams delivery cannot be retried safely.' }
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
    await postTextToTeams(webhookUrl, "Virtual Product Owner webhook connection test. This confirms message delivery only; bot commands and automatic notifications are unavailable.")
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
  if (channelName.trim().length > 255 || !isTeamsWebhookUrl(webhookUrl)) return { success: false, error: 'A valid Teams channel and HTTPS webhook URL are required.' }

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
    if (!session.user.orgId) return { success: false, error: "No organization found." }
    if (!await deleteTeamsNotification(id, session.user.orgId)) return { success: false, error: "Notification configuration not found." }
    revalidatePath("/settings")
    return { success: true }
  } catch {
    return {
      success: false,
      error: "Failed to remove notification configuration.",
    }
  }
}
