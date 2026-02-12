"use server"

import { requireAuth } from "@/lib/auth/session"
import { revalidatePath } from "next/cache"
import {
  getIntegrationByType,
  upsertIntegration,
  deactivateIntegration,
  logGitHubSync,
  updateEpicGitHubKeys,
  updateStoryGitHubKeys,
  updateFeatureRequestGitHubKeys,
} from "@/lib/db/queries/github-sync"
import {
  getGitHubIssuesClientFromToken,
} from "@/lib/github/issues-client"
import { getGitHubToken } from "@/lib/github/client"
import { getEpicByRequestId, getStoriesByEpicId } from "@/lib/db/queries/epics"
import { createFeatureRequest } from "@/lib/db/queries/feature-requests"
import { canAccess } from "@/lib/auth/rbac"
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

    const epic = await getEpicByRequestId(requestId)
    if (!epic) {
      return { success: false, error: "No epic found for this request." }
    }

    const stories = await getStoriesByEpicId(epic.id)

    const token = await getGitHubToken(session.user.id)
    if (!token) {
      return { success: false, error: "No GitHub account connected." }
    }

    const client = getGitHubIssuesClientFromToken(token)
    const resolvedRepo = repoFullName ?? (integration.config.defaultRepo as string)

    if (!resolvedRepo) {
      return { success: false, error: "No repository specified." }
    }

    const { owner, repo } = parseRepo(resolvedRepo)

    // Create the epic as a GitHub issue with "epic" label
    const epicBody = [
      epic.description ?? "",
      "",
      "## Goals",
      ...(epic.goals ?? []).map((g) => `- ${g}`),
      "",
      "## Success Criteria",
      ...(epic.successCriteria ?? []).map((c) => `- ${c}`),
      epic.technicalNotes ? `\n## Technical Notes\n${epic.technicalNotes}` : "",
    ].join("\n")

    const ghEpic = await client.createIssue(
      owner,
      repo,
      epic.title,
      epicBody,
      ["epic"]
    )

    await updateEpicGitHubKeys(epic.id, ghEpic.number, ghEpic.html_url)
    await logGitHubSync(orgId, "EPIC", epic.id, ghEpic.number, "PUSH", "SUCCESS")

    // Optionally add to a project
    const defaultProjectId = integration.config.defaultProjectId as string
    if (defaultProjectId) {
      try {
        await client.addIssueToProject(defaultProjectId, ghEpic.node_id)
      } catch {
        // Non-fatal: project linking can fail without blocking the sync
      }
    }

    // Create GitHub issues for each story, referencing the epic
    for (const story of stories) {
      try {
        const storyBody = [
          `**As** ${story.asA}, **I want** ${story.iWant}, **so that** ${story.soThat}`,
          "",
          "## Acceptance Criteria",
          ...(story.acceptanceCriteria ?? []).map((c) => `- [ ] ${c}`),
          story.technicalNotes ? `\n## Technical Notes\n${story.technicalNotes}` : "",
          story.storyPoints != null ? `\n**Story Points:** ${story.storyPoints}` : "",
          "",
          `Part of epic #${ghEpic.number}`,
        ].join("\n")

        const ghStory = await client.createIssue(
          owner,
          repo,
          story.title,
          storyBody,
          ["user-story"]
        )

        await updateStoryGitHubKeys(story.id, ghStory.number, ghStory.html_url)
        await logGitHubSync(
          orgId,
          "STORY",
          story.id,
          ghStory.number,
          "PUSH",
          "SUCCESS"
        )

        // Also add stories to the project if configured
        if (defaultProjectId) {
          try {
            await client.addIssueToProject(defaultProjectId, ghStory.node_id)
          } catch {
            // Non-fatal
          }
        }
      } catch {
        await logGitHubSync(
          orgId,
          "STORY",
          story.id,
          null,
          "PUSH",
          "FAILED",
          `Failed to create GitHub issue for: ${story.title}`
        )
      }
    }

    revalidatePath(`/requests/${requestId}`)
    return { success: true, githubIssueNumber: ghEpic.number, githubIssueUrl: ghEpic.html_url }
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
