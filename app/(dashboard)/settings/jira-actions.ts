"use server"

import { requireAuth } from "@/lib/auth/session"
import { revalidatePath } from "next/cache"
import {
  getIntegrationByType,
  upsertIntegration,
  deactivateIntegration,
  logJiraSync,


  updateFeatureRequestJiraKeys,
} from "@/lib/db/queries/jira-sync"
import {
  createJiraClient,
  getJiraClientFromIntegration,
} from "@/lib/jira/client"
import { getEpicByRequestId } from "@/lib/db/queries/epics"
import { createFeatureRequest, getFeatureRequestById } from "@/lib/db/queries/feature-requests"
import { canAccess } from "@/lib/auth/rbac"
import { exportJira } from "@/lib/export/adapters"
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

    const client = getJiraClientFromIntegration(integration)
    const searchJql =
      jql ?? `project = ${projectKey} AND issuetype in (Story, Task, Bug) ORDER BY created DESC`
    const { issues } = await client.searchIssues(searchJql)

    let imported = 0
    for (const issue of issues) {
      const title = issue.fields.summary
      const featureRequest = await createFeatureRequest(
        orgId,
        session.user.id,
        title
      )

      await updateFeatureRequestJiraKeys(
        featureRequest.id,
        issue.key,
        `${(integration.config.baseUrl as string).replace(/\/$/, "")}/browse/${issue.key}`
      )

      await logJiraSync(
        orgId,
        "FEATURE_REQUEST",
        featureRequest.id,
        issue.key,
        "PULL",
        "SUCCESS"
      )
      imported++
    }

    revalidatePath("/requests")
    return { success: true, imported }
  } catch {
    return { success: false, error: "Failed to import from Jira." }
  }
}
