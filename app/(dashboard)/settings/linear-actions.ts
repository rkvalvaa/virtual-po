"use server"

import { requireAuth } from "@/lib/auth/session"
import { revalidatePath } from "next/cache"
import {
  getIntegrationByType,
  upsertIntegration,
  deactivateIntegration,
} from "@/lib/db/queries/jira-sync"
import {
  logLinearSync,


} from "@/lib/db/queries/linear-sync"
import { getLinearClientFromIntegration } from "@/lib/linear/client"
import { getEpicByRequestId } from "@/lib/db/queries/epics"
import { createFeatureRequest, getFeatureRequestById } from "@/lib/db/queries/feature-requests"
import { canAccess } from "@/lib/auth/rbac"
import { exportLinear } from "@/lib/export/adapters"
import "@/lib/auth/types"

export async function connectLinear(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  const session = await requireAuth()

  if (!canAccess(session.user.role, "ADMIN")) {
    return { success: false, error: "Only admins can connect Linear." }
  }

  const orgId = session.user.orgId
  if (!orgId) {
    return { success: false, error: "No organization found." }
  }

  const apiKey = formData.get("apiKey") as string | null
  const defaultTeamId = formData.get("defaultTeamId") as string | null

  if (!apiKey) {
    return { success: false, error: "API key is required." }
  }

  try {
    await upsertIntegration(orgId, "LINEAR", "Linear", {
      apiKey,
      defaultTeamId: defaultTeamId ?? "",
    })

    revalidatePath("/settings")
    return { success: true }
  } catch {
    return { success: false, error: "Failed to connect to Linear." }
  }
}

export async function disconnectLinear(): Promise<{
  success: boolean
  error?: string
}> {
  const session = await requireAuth()

  if (!canAccess(session.user.role, "ADMIN")) {
    return { success: false, error: "Only admins can disconnect Linear." }
  }

  const orgId = session.user.orgId
  if (!orgId) {
    return { success: false, error: "No organization found." }
  }

  try {
    const integration = await getIntegrationByType(orgId, "LINEAR")
    if (!integration) {
      return { success: false, error: "No Linear integration found." }
    }

    await deactivateIntegration(integration.id)
    revalidatePath("/settings")
    return { success: true }
  } catch {
    return { success: false, error: "Failed to disconnect Linear." }
  }
}

export async function testLinearConnection(): Promise<{
  success: boolean
  teams?: Array<{ id: string; name: string; key: string }>
  error?: string
}> {
  const session = await requireAuth()

  if (!canAccess(session.user.role, "ADMIN")) {
    return { success: false, error: "Only admins can test the Linear connection." }
  }

  const orgId = session.user.orgId
  if (!orgId) {
    return { success: false, error: "No organization found." }
  }

  try {
    const integration = await getIntegrationByType(orgId, "LINEAR")
    if (!integration) {
      return { success: false, error: "No Linear integration found." }
    }

    const client = getLinearClientFromIntegration(integration)
    const teams = await client.getTeams()
    return { success: true, teams }
  } catch {
    return { success: false, error: "Failed to connect to Linear. Please check your API key." }
  }
}

export async function syncEpicToLinear(
  requestId: string,
  teamId?: string
): Promise<{
  success: boolean
  linearProjectId?: string
  linearProjectUrl?: string
  error?: string
}> {
  const session = await requireAuth()

  if (!canAccess(session.user.role, "REVIEWER")) {
    return { success: false, error: "Insufficient permissions." }
  }

  const orgId = session.user.orgId
  if (!orgId) {
    return { success: false, error: "No organization found." }
  }

  try {
    const integration = await getIntegrationByType(orgId, "LINEAR")
    if (!integration) {
      return { success: false, error: "No Linear integration found." }
    }

    const request = await getFeatureRequestById(requestId)
    if (!request || request.organizationId !== orgId) {
      return { success: false, error: "Request not found." }
    }

    const epic = await getEpicByRequestId(requestId, orgId)
    if (!epic) {
      return { success: false, error: "No epic found for this request." }
    }


    const client = getLinearClientFromIntegration(integration)
    const resolvedTeamId =
      teamId ?? (integration.config.defaultTeamId as string)

    if (!resolvedTeamId) {
      return { success: false, error: "No team ID specified." }
    }

    const teams = await client.getTeams()
    if (!teams.some(team => team.id === resolvedTeamId)) {
      return { success: false, error: "Select an accessible Linear team." }
    }

    const result = await exportLinear({ requestId, orgId, userId: session.user.id }, resolvedTeamId, client)
    revalidatePath(`/requests/${requestId}`)
    return { ...result, linearProjectId: result.items[0]?.external?.id, linearProjectUrl: result.items[0]?.external?.url }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to sync to Linear."
    return { success: false, error: message }
  }
}

export async function importFromLinear(
  teamId: string,
  searchQuery?: string
): Promise<{
  success: boolean
  imported?: number
  error?: string
}> {
  const session = await requireAuth()

  if (!canAccess(session.user.role, "REVIEWER")) {
    return { success: false, error: "Insufficient permissions." }
  }

  const orgId = session.user.orgId
  if (!orgId) {
    return { success: false, error: "No organization found." }
  }

  try {
    const integration = await getIntegrationByType(orgId, "LINEAR")
    if (!integration) {
      return { success: false, error: "No Linear integration found." }
    }

    const client = getLinearClientFromIntegration(integration)
    const query = searchQuery ?? `team:${teamId}`
    const issues = await client.searchIssues(query, teamId)

    let imported = 0
    for (const issue of issues) {
      const featureRequest = await createFeatureRequest(
        orgId,
        session.user.id,
        issue.title
      )

      await logLinearSync(
        orgId,
        "FEATURE_REQUEST",
        featureRequest.id,
        issue.id,
        "PULL",
        "SUCCESS"
      )
      imported++
    }

    revalidatePath("/requests")
    return { success: true, imported }
  } catch {
    return { success: false, error: "Failed to import from Linear." }
  }
}
