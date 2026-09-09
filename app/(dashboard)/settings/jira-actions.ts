"use server"

import { requireAuth } from "@/lib/auth/session"
import { revalidatePath } from "next/cache"
import {
  getIntegrationByType,
  upsertIntegration,
  deactivateIntegration,
} from "@/lib/db/queries/jira-sync"
import {
  createJiraClient,
  getJiraClientFromIntegration,
} from "@/lib/jira/client"
import { getEpicByRequestId } from "@/lib/db/queries/epics"
import { getFeatureRequestById } from "@/lib/db/queries/feature-requests"
import { canAccess } from "@/lib/auth/rbac"
import { exportJira } from "@/lib/export/adapters"
import { previewJiraPage } from "@/lib/import/provider-pages"
import { importSelectedPreview, requireTrackerImportAccess, resolveImportConflictForProvider, trackerActionError } from "@/lib/import/actions"
import type { TrackerConflictResolution, TrackerImportField } from "@/lib/import/tracker-imports"
import "@/lib/auth/types"

export async function connectJira(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  const session = await requireAuth()

  if (!canAccess(session.user.role, "ADMIN")) {
    return { success: false, error: "Only admins can connect Jira." }
  }

  const orgId = session.user.orgId
  if (!orgId) {
    return { success: false, error: "No organization found." }
  }

  const siteUrl = formData.get("siteUrl") as string | null
  const email = formData.get("email") as string | null
  const apiToken = formData.get("apiToken") as string | null
  const defaultProjectKey = formData.get("defaultProjectKey") as string | null

  if (!siteUrl || !email || !apiToken) {
    return { success: false, error: "Site URL, email, and API token are required." }
  }

  try {
    // Validate the connection first
    const client = createJiraClient({
      baseUrl: siteUrl,
      email,
      apiToken,
    })
    await client.getProjects()

    await upsertIntegration(orgId, "JIRA", "Jira", {
      baseUrl: siteUrl,
      email,
      apiToken,
      defaultProjectKey: defaultProjectKey ?? "",
    })

    revalidatePath("/settings")
    return { success: true }
  } catch {
    return { success: false, error: "Failed to connect to Jira. Please check your credentials." }
  }
}

export async function disconnectJira(): Promise<{
  success: boolean
  error?: string
}> {
  const session = await requireAuth()

  if (!canAccess(session.user.role, "ADMIN")) {
    return { success: false, error: "Only admins can disconnect Jira." }
  }

  const orgId = session.user.orgId
  if (!orgId) {
    return { success: false, error: "No organization found." }
  }

  try {
    const integration = await getIntegrationByType(orgId, "JIRA")
    if (!integration) {
      return { success: false, error: "No Jira integration found." }
    }

    await deactivateIntegration(integration.id)
    revalidatePath("/settings")
    return { success: true }
  } catch {
    return { success: false, error: "Failed to disconnect Jira." }
  }
}

export async function testJiraConnection(): Promise<{
  success: boolean
  projects?: Array<{ id: string; key: string; name: string }>
  error?: string
}> {
  const session = await requireAuth()

  if (!canAccess(session.user.role, "ADMIN")) {
    return { success: false, error: "Only admins can test the Jira connection." }
  }

  const orgId = session.user.orgId
  if (!orgId) {
    return { success: false, error: "No organization found." }
  }

  try {
    const integration = await getIntegrationByType(orgId, "JIRA")
    if (!integration) {
      return { success: false, error: "No Jira integration found." }
    }

    const client = getJiraClientFromIntegration(integration)
    const projects = await client.getProjects()
    return { success: true, projects }
  } catch {
    return { success: false, error: "Failed to connect to Jira. Please check your credentials." }
  }
}

export async function syncEpicToJira(
  requestId: string,
  projectKey?: string
): Promise<{
  success: boolean
  jiraEpicKey?: string
  jiraEpicUrl?: string
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
    const integration = await getIntegrationByType(orgId, "JIRA")
    if (!integration) {
      return { success: false, error: "No Jira integration found." }
    }

    const request = await getFeatureRequestById(requestId)
    if (!request || request.organizationId !== orgId) {
      return { success: false, error: "Request not found." }
    }

    const epic = await getEpicByRequestId(requestId, orgId)
    if (!epic) {
      return { success: false, error: "No epic found for this request." }
    }


    const client = getJiraClientFromIntegration(integration)
    const resolvedProjectKey =
      projectKey ?? (integration.config.defaultProjectKey as string)

    if (!resolvedProjectKey) {
      return { success: false, error: "No project key specified." }
    }

    const projects = await client.getProjects()
    if (!projects.some(project => project.key === resolvedProjectKey)) {
      return { success: false, error: "Select an accessible Jira project." }
    }

    const result = await exportJira({ requestId, orgId, userId: session.user.id }, resolvedProjectKey, integration.config.baseUrl as string, client)
    revalidatePath(`/requests/${requestId}`)
    return { ...result, jiraEpicKey: result.items[0]?.external?.id, jiraEpicUrl: result.items[0]?.external?.url }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to sync to Jira."
    return { success: false, error: message }
  }
}

export async function importFromJira(
  projectKey: string,
  jql?: string
): Promise<{
  success: boolean
  imported?: number
  error?: string
}> {
  const preview = await previewJiraImport({ projectKey, jql })
  if (!preview.success) return { success: false, error: preview.error }
  const result = await importJiraPage({ projectKey, jql, remoteEntityIds: preview.page.items.map(item => item.remoteEntityId) })
  return result.success ? { success: true, imported: result.result.created + result.result.updated } : result
}

export interface JiraImportInput { projectKey: string; jql?: string; cursor?: string | null }

async function loadJiraImportPage(input: JiraImportInput) {
  const access = await requireTrackerImportAccess('JIRA')
  if (!access.success) return access
  const client = getJiraClientFromIntegration(access.integration)
  const projects = await client.getProjects()
  const project = projects.find(project => project.key === input.projectKey)
  if (!project) return { success: false as const, error: 'Select an accessible Jira project.' }
  const page = await previewJiraPage(client, { ...input, projectId: project.id, baseUrl: access.integration.config.baseUrl as string })
  return { success: true as const, access, page }
}

export async function previewJiraImport(input: JiraImportInput) {
  try {
    const loaded = await loadJiraImportPage(input)
    return loaded.success ? { success: true as const, page: loaded.page } : loaded
  } catch (error) {
    return { success: false as const, error: trackerActionError(error, 'Failed to preview Jira issues.') }
  }
}

export async function importJiraPage(input: JiraImportInput & { remoteEntityIds: string[] }) {
  try {
    const loaded = await loadJiraImportPage(input)
    if (!loaded.success) return loaded
    const result = await importSelectedPreview(loaded.access.context, loaded.page, input.remoteEntityIds)
    if (result.success) revalidatePath('/requests')
    return result
  } catch (error) {
    return { success: false as const, error: trackerActionError(error, 'Failed to import from Jira.') }
  }
}

export async function resolveJiraImportConflict(linkId: string, resolutions: Partial<Record<TrackerImportField, TrackerConflictResolution>>) {
  try {
    const result = await resolveImportConflictForProvider('JIRA', linkId, resolutions)
    if (result.success) revalidatePath('/requests')
    return result
  } catch (error) {
    return { success: false as const, error: trackerActionError(error, 'Failed to resolve Jira import conflict.') }
  }
}
