"use server"

import { requireAuth } from "@/lib/auth/session"
import { revalidatePath } from "next/cache"
import {
  getIntegrationByType,
  upsertIntegration,
  deactivateIntegration,
  logGitHubSync,


  updateFeatureRequestGitHubKeys,
} from "@/lib/db/queries/github-sync"
import {
  getGitHubIssuesClientFromToken,
} from "@/lib/github/issues-client"
import { getGitHubToken } from "@/lib/github/client"
import { getEpicByRequestId } from "@/lib/db/queries/epics"
import { createFeatureRequest, getFeatureRequestById } from "@/lib/db/queries/feature-requests"
import { canAccess } from "@/lib/auth/rbac"
import { exportGitHub } from "@/lib/export/adapters"
import "@/lib/auth/types"

function parseRepo(repoFullName: string): { owner: string; repo: string } {
  const parts = repoFullName.split("/")
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`Invalid repository name: ${repoFullName}. Expected format: owner/repo`)
  }
  return { owner: parts[0], repo: parts[1] }
}

export async function connectGitHubIssues(
  formData: FormData
): Promise<{ success: boolean; error?: string }> {
  const session = await requireAuth()

  if (!canAccess(session.user.role, "ADMIN")) {
    return { success: false, error: "Only admins can connect GitHub Issues." }
  }

  const orgId = session.user.orgId
  if (!orgId) {
    return { success: false, error: "No organization found." }
  }

  const defaultRepo = formData.get("defaultRepo") as string | null
  const defaultProjectId = formData.get("defaultProjectId") as string | null

  if (!defaultRepo) {
    return { success: false, error: "Default repository is required (owner/repo)." }
  }

  try {
    const token = await getGitHubToken(session.user.id)
    if (!token) {
      return { success: false, error: "No GitHub account connected. Please connect GitHub in your profile first." }
    }

    // Validate the connection by listing labels on the repo
    const { owner, repo } = parseRepo(defaultRepo)
    const client = getGitHubIssuesClientFromToken(token)
    await client.listLabels(owner, repo)

    await upsertIntegration(orgId, "GITHUB_ISSUES", "GitHub Issues", {
      defaultRepo,
      defaultProjectId: defaultProjectId ?? "",
    })

    revalidatePath("/settings")
    return { success: true }
  } catch {
    return { success: false, error: "Failed to connect to GitHub Issues. Please check the repository name and your permissions." }
  }
}

export async function disconnectGitHubIssues(): Promise<{
  success: boolean
  error?: string
}> {
  const session = await requireAuth()

  if (!canAccess(session.user.role, "ADMIN")) {
    return { success: false, error: "Only admins can disconnect GitHub Issues." }
  }

  const orgId = session.user.orgId
  if (!orgId) {
    return { success: false, error: "No organization found." }
  }

  try {
    const integration = await getIntegrationByType(orgId, "GITHUB_ISSUES")
    if (!integration) {
      return { success: false, error: "No GitHub Issues integration found." }
    }

    await deactivateIntegration(integration.id)
    revalidatePath("/settings")
    return { success: true }
  } catch {
    return { success: false, error: "Failed to disconnect GitHub Issues." }
  }
}

export async function testGitHubIssuesConnection(): Promise<{
  success: boolean
  repoName?: string
  error?: string
}> {
  const session = await requireAuth()

  if (!canAccess(session.user.role, "ADMIN")) {
    return { success: false, error: "Only admins can test the GitHub Issues connection." }
  }

  const orgId = session.user.orgId
  if (!orgId) {
    return { success: false, error: "No organization found." }
  }

  try {
    const integration = await getIntegrationByType(orgId, "GITHUB_ISSUES")
    if (!integration) {
      return { success: false, error: "No GitHub Issues integration found." }
    }

    const token = await getGitHubToken(session.user.id)
    if (!token) {
      return { success: false, error: "No GitHub account connected." }
    }

    const defaultRepo = integration.config.defaultRepo as string
    const { owner, repo } = parseRepo(defaultRepo)
    const client = getGitHubIssuesClientFromToken(token)
    await client.listLabels(owner, repo)

    return { success: true, repoName: defaultRepo }
  } catch {
    return { success: false, error: "Failed to connect to GitHub. Please check your permissions." }
  }
}

export async function syncToGitHubIssues(
  requestId: string,
  repoFullName?: string
): Promise<{
  success: boolean
  githubIssueNumber?: number
  githubIssueUrl?: string
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
    const integration = await getIntegrationByType(orgId, "GITHUB_ISSUES")
    if (!integration) {
      return { success: false, error: "No GitHub Issues integration found." }
    }

    const request = await getFeatureRequestById(requestId)
    if (!request || request.organizationId !== orgId) {
      return { success: false, error: "Request not found." }
    }

    const epic = await getEpicByRequestId(requestId, orgId)
    if (!epic) {
      return { success: false, error: "No epic found for this request." }
    }



    const token = await getGitHubToken(session.user.id)
    if (!token) {
      return { success: false, error: "No GitHub account connected." }
    }

    const client = getGitHubIssuesClientFromToken(token)
    const resolvedRepo = repoFullName ?? (integration.config.defaultRepo as string)

    if (!resolvedRepo) {
      return { success: false, error: "No repository specified." }
    }

    if (resolvedRepo !== integration.config.defaultRepo) {
      return { success: false, error: "Select the repository configured by your workspace administrator." }
    }
    const { owner, repo } = parseRepo(resolvedRepo)
    await client.listLabels(owner, repo)

    const result = await exportGitHub({ requestId, orgId, userId: session.user.id }, owner, repo, integration.config.defaultProjectId as string | undefined, client)
    revalidatePath(`/requests/${requestId}`)
    return { ...result, githubIssueNumber: result.items[0]?.external ? Number(result.items[0].external.id) : undefined, githubIssueUrl: result.items[0]?.external?.url }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to sync to GitHub Issues."
    return { success: false, error: message }
  }
}

export async function importFromGitHub(
  repoFullName: string,
  label?: string
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
    const integration = await getIntegrationByType(orgId, "GITHUB_ISSUES")
    if (!integration) {
      return { success: false, error: "No GitHub Issues integration found." }
    }

    const token = await getGitHubToken(session.user.id)
    if (!token) {
      return { success: false, error: "No GitHub account connected." }
    }

    const client = getGitHubIssuesClientFromToken(token)
    const { owner, repo } = parseRepo(repoFullName)

    const searchQuery = label
      ? `is:issue is:open label:"${label}"`
      : "is:issue is:open"

    const { items: issues } = await client.searchIssues(owner, repo, searchQuery)

    let imported = 0
    for (const issue of issues) {
      const featureRequest = await createFeatureRequest(
        orgId,
        session.user.id,
        issue.title
      )

      await updateFeatureRequestGitHubKeys(
        featureRequest.id,
        issue.number,
        issue.html_url
      )

      await logGitHubSync(
        orgId,
        "FEATURE_REQUEST",
        featureRequest.id,
        issue.number,
        "PULL",
        "SUCCESS"
      )
      imported++
    }

    revalidatePath("/requests")
    return { success: true, imported }
  } catch {
    return { success: false, error: "Failed to import from GitHub." }
  }
}
