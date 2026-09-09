import {
  createOrganization,
  addUserToOrganization,
} from "@/lib/db/queries/organizations"
import {
  getPreferredWorkspace,
  rememberWorkspace,
} from "@/lib/db/queries/workspaces"
import type { UserRole } from "@/lib/types/database"
import crypto from "crypto"

/**
 * Ensure a user has at least one organization.
 * If they don't, create a personal workspace and add them as ADMIN.
 * Returns the orgId and role for JWT token storage.
 */
export async function ensureUserOrganization(
  userId: string,
  email: string
): Promise<{ orgId: string; role: UserRole }> {
  const existing = await getPreferredWorkspace(userId)
  if (existing) {
    await rememberWorkspace(userId, existing.orgId)
    return existing
  }

  // Derive org name and slug from email
  const username = email.split("@")[0] ?? "user"
  const name = `${username}'s workspace`
  const suffix = crypto.randomBytes(2).toString("hex") // 4 hex chars
  const slug = `${username.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${suffix}`

  // Create the organization and add user as ADMIN
  const org = await createOrganization(name, slug)
  await addUserToOrganization(org.id, userId, "ADMIN")
  await rememberWorkspace(userId, org.id)

  return { orgId: org.id, role: "ADMIN" }
}
