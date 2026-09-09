"use server"

import { requireAuth } from "@/lib/auth/session"
import { revalidatePath } from "next/cache"
import {
  getIntegrationByType,
  upsertIntegration,
  deactivateIntegration,
} from "@/lib/db/queries/jira-sync"
import { getLinearClientFromIntegration } from "@/lib/linear/client"
import { getEpicByRequestId } from "@/lib/db/queries/epics"
import { getFeatureRequestById } from "@/lib/db/queries/feature-requests"
import { canAccess } from "@/lib/auth/rbac"
import { exportLinear } from "@/lib/export/adapters"
import { previewLinearPage } from "@/lib/import/provider-pages"
import { importSelectedPreview, requireTrackerImportAccess, resolveImportConflictForProvider, trackerActionError } from "@/lib/import/actions"
import type { TrackerConflictResolution, TrackerImportField } from "@/lib/import/tracker-imports"
import { getStatusSyncOverview, upsertStatusSyncConfig } from "@/lib/db/queries/tracker-status-sync"
import { reconcileLinearStatuses, resolveLinearStatusConflict } from "@/lib/status-sync/linear"
import type { StatusMapping } from "@/lib/status-sync/types"
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
  const preview = await previewLinearImport({ teamId, searchQuery })
  if (!preview.success) return { success: false, error: preview.error }
  const result = await importLinearPage({ teamId, searchQuery, remoteEntityIds: preview.page.items.map(item => item.remoteEntityId) })
  return result.success ? { success: true, imported: result.result.created + result.result.updated } : result
}

export interface LinearImportInput { teamId: string; searchQuery?: string; cursor?: string | null }

async function loadLinearImportPage(input: LinearImportInput) {
  const access = await requireTrackerImportAccess('LINEAR')
  if (!access.success) return access
  const client = getLinearClientFromIntegration(access.integration)
  const teams = await client.getTeams()
  if (!teams.some(team => team.id === input.teamId)) return { success: false as const, error: 'Select an accessible Linear team.' }
  const page = await previewLinearPage(client, input)
  return { success: true as const, access, page }
}

export async function previewLinearImport(input: LinearImportInput) {
  try {
    const loaded = await loadLinearImportPage(input)
    return loaded.success ? { success: true as const, page: loaded.page } : loaded
  } catch (error) {
    return { success: false as const, error: trackerActionError(error, 'Failed to preview Linear issues.') }
  }
}

export async function importLinearPage(input: LinearImportInput & { remoteEntityIds: string[] }) {
  try {
    const loaded = await loadLinearImportPage(input)
    if (!loaded.success) return loaded
    const result = await importSelectedPreview(loaded.access.context, loaded.page, input.remoteEntityIds)
    if (result.success) revalidatePath('/requests')
    return result
  } catch (error) {
    return { success: false as const, error: trackerActionError(error, 'Failed to import from Linear.') }
  }
}

export async function resolveLinearImportConflict(linkId: string, resolutions: Partial<Record<TrackerImportField, TrackerConflictResolution>>) {
  try {
    const result = await resolveImportConflictForProvider('LINEAR', linkId, resolutions)
    if (result.success) revalidatePath('/requests')
    return result
  } catch (error) {
    return { success: false as const, error: trackerActionError(error, 'Failed to resolve Linear import conflict.') }
  }
}

function serializeStatusOverview(overview: Awaited<ReturnType<typeof getStatusSyncOverview>>) {
  return {
    config: overview.config ? {
      ...overview.config,
      checkpointAt: overview.config.checkpointAt?.toISOString() ?? null,
      lastSyncAt: overview.config.lastSyncAt?.toISOString() ?? null,
      lastReconciledAt: overview.config.lastReconciledAt?.toISOString() ?? null,
      nextAttemptAt: overview.config.nextAttemptAt.toISOString(),
      createdAt: overview.config.createdAt.toISOString(),
      updatedAt: overview.config.updatedAt.toISOString(),
    } : null,
    conflicts: overview.conflicts.map(conflict => ({ ...conflict, createdAt: conflict.createdAt.toISOString() })),
  }
}

async function requireLinearStatusAccess(requiredRole: "REVIEWER" | "ADMIN") {
  const session = await requireAuth()
  if (!canAccess(session.user.role, requiredRole)) {
    return { success: false as const, error: requiredRole === "ADMIN" ? "Only admins can configure Linear status sync." : "Insufficient permissions." }
  }
  if (!session.user.orgId) return { success: false as const, error: "No organization found." }
  const integration = await getIntegrationByType(session.user.orgId, "LINEAR")
  if (!integration) return { success: false as const, error: "No active Linear integration found." }
  return { success: true as const, session, integration, client: getLinearClientFromIntegration(integration) }
}

export async function getLinearStatusSyncOverview(destination: string) {
  const access = await requireLinearStatusAccess("REVIEWER")
  if (!access.success) return access
  const overview = await getStatusSyncOverview(access.session.user.orgId!, "LINEAR", destination.trim())
  return { success: true as const, overview: serializeStatusOverview(overview) }
}

export async function loadLinearStatusWorkflowStates(destination: string) {
  const access = await requireLinearStatusAccess("ADMIN")
  if (!access.success) return access
  try {
    const teamId = destination.trim()
    if (!(await access.client.getTeams()).some(team => team.id === teamId)) return { success: false as const, error: "Select an accessible Linear team." }
    return { success: true as const, states: await access.client.getWorkflowStates(teamId) }
  } catch {
    return { success: false as const, error: "Unable to load Linear statuses. Reconnect Linear if its credentials were revoked." }
  }
}

export async function saveLinearStatusSync(input: { destination: string; enabled: boolean; mappings: StatusMapping[] }) {
  const access = await requireLinearStatusAccess("ADMIN")
  if (!access.success) return access
  try {
    const destination = input.destination.trim()
    const teams = await access.client.getTeams()
    if (!teams.some(team => team.id === destination)) return { success: false as const, error: "Select an accessible Linear team." }
    const available = await access.client.getWorkflowStates(destination)
    const byId = new Map(available.map(state => [state.id, state]))
    const mappings = input.mappings.map(mapping => {
      const state = byId.get(mapping.remoteStatusId)
      if (!state) throw new Error("A selected Linear status is no longer available.")
      return { ...mapping, remoteStatusName: state.name }
    })
    if (input.enabled && mappings.length === 0) throw new Error("Map at least one Linear status before enabling sync.")
    await upsertStatusSyncConfig({ organizationId: access.session.user.orgId!, provider: "LINEAR", destination, enabled: input.enabled, mappings, updatedBy: access.session.user.id })
    revalidatePath("/settings")
    return { success: true as const }
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : "Unable to save Linear status sync." }
  }
}

export async function reconcileLinearStatusSync(destination: string) {
  const access = await requireLinearStatusAccess("ADMIN")
  if (!access.success) return access
  try {
    const result = await reconcileLinearStatuses({ organizationId: access.session.user.orgId!, destination: destination.trim(), client: access.client })
    revalidatePath("/settings")
    return { success: true as const, result }
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : "Linear reconciliation failed." }
  }
}

export async function resolveLinearStatusSyncConflict(destination: string, conflictId: string, resolution: "KEEP_LOCAL" | "APPLY_REMOTE") {
  const access = await requireLinearStatusAccess("ADMIN")
  if (!access.success) return access
  try {
    await resolveLinearStatusConflict({ organizationId: access.session.user.orgId!, conflictId, resolution, resolvedBy: access.session.user.id })
    revalidatePath("/settings")
    revalidatePath("/requests")
    return { success: true as const }
  } catch (error) {
    return { success: false as const, error: error instanceof Error ? error.message : "Unable to resolve the status conflict." }
  }
}
