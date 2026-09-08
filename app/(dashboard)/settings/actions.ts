"use server"

import { requireAuth } from "@/lib/auth/session"
import { getGitHubToken, getUserRepos } from "@/lib/github/client"
import {
  connectRepository,
  disconnectRepository,
  getRepositoryById,
} from "@/lib/db/queries/repositories"
import { query, transaction } from "@/lib/db/pool"
import { z } from "zod"
import { revalidatePath } from "next/cache"
import "@/lib/auth/types"
import type { GitHubRepo } from "@/lib/github/client"

export async function fetchAvailableRepos(): Promise<
  { repos: GitHubRepo[] } | { error: string }
> {
  const session = await requireAuth()
  if (session.user.role !== "ADMIN") return { error: "Only admins can manage repositories." }
  const token = await getGitHubToken(session.user.id)

  if (!token) {
    return {
      error:
        "No GitHub account connected. Please sign out and sign back in with GitHub to grant repository access.",
    }
  }

  try { return { repos: await getUserRepos(token) } }
  catch { return { error: "Unable to load GitHub repositories. Please retry." } }
}

export async function connectRepo(
  githubRepoId: number
): Promise<{ success: boolean; error?: string }> {
  const session = await requireAuth()
  const orgId = session.user.orgId
  if (session.user.role !== "ADMIN") return { success: false, error: "Only admins can manage repositories." }
  if (!z.number().int().positive().safeParse(githubRepoId).success) return { success: false, error: "Invalid repository ID." }

  if (!orgId) {
    return { success: false, error: "No organization found." }
  }

  try {
    const token = await getGitHubToken(session.user.id)
    if (!token) return { success: false, error: "Connect your GitHub account before adding a repository." }
    const repository = (await getUserRepos(token)).find(repo => repo.id === githubRepoId)
    if (!repository) return { success: false, error: "GitHub could not verify access to this repository. Reload the repository list and retry." }
    await transaction(async () => {
      await assertCurrentAdmin(orgId, session.user.id)
      await connectRepository(
        orgId,
        githubRepoId,
        repository.owner,
        repository.name,
        repository.fullName,
        repository.defaultBranch,
        session.user.id
      )
    })
    revalidatePath("/settings")
    return { success: true }
  } catch {
    return { success: false, error: "Failed to connect repository." }
  }
}

export async function disconnectRepo(
  repoId: string
): Promise<{ success: boolean; error?: string }> {
  const session = await requireAuth()
  const orgId = session.user.orgId
  if (session.user.role !== "ADMIN") return { success: false, error: "Only admins can manage repositories." }
  if (!z.uuid().safeParse(repoId).success) return { success: false, error: "Invalid repository ID." }

  if (!orgId) {
    return { success: false, error: "No organization found." }
  }

  try {
    await transaction(async () => {
      await assertCurrentAdmin(orgId, session.user.id)
      const repository = await getRepositoryById(repoId)
      if (!repository || repository.organizationId !== orgId) throw new Error("Repository unavailable")
      await disconnectRepository(repoId, orgId)
    })
    revalidatePath("/settings")
    return { success: true }
  } catch {
    return { success: false, error: "Failed to disconnect repository." }
  }
}

async function assertCurrentAdmin(orgId: string, userId: string) {
  const member = await query(`SELECT user_id FROM organization_users
    WHERE organization_id = $1 AND user_id = $2 AND role = 'ADMIN' FOR SHARE`, [orgId, userId])
  if (!member.rows.length) throw new Error("Admin access is required")
}
