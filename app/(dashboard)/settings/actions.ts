"use server"

import { requireAuth } from "@/lib/auth/session"
import { getGitHubToken, getUserRepos } from "@/lib/github/client"
import {
  connectRepository,
  disconnectRepository,
} from "@/lib/db/queries/repositories"
import { revalidatePath } from "next/cache"
import "@/lib/auth/types"
import type { GitHubRepo } from "@/lib/github/client"

export async function fetchAvailableRepos(): Promise<
  { repos: GitHubRepo[] } | { error: string }
> {
  const session = await requireAuth()
  const token = await getGitHubToken(session.user.id)

  if (!token) {
    return {
      error:
        "No GitHub account connected. Please sign out and sign back in with GitHub to grant repository access.",
    }
  }

  const repos = await getUserRepos(token)
  return { repos }
}

export async function connectRepo(
  githubRepoId: number,
  owner: string,
  name: string,
  fullName: string,
  defaultBranch: string
): Promise<{ success: boolean; error?: string }> {
  const session = await requireAuth()
  const orgId = session.user.orgId

  if (!orgId) {
    return { success: false, error: "No organization found." }
  }

  try {
    await connectRepository(
      orgId,
      githubRepoId,
      owner,
      name,
      fullName,
      defaultBranch,
      session.user.id
    )
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

  if (!orgId) {
    return { success: false, error: "No organization found." }
  }

  try {
    await disconnectRepository(repoId, orgId)
    revalidatePath("/settings")
    return { success: true }
  } catch {
    return { success: false, error: "Failed to disconnect repository." }
  }
}
