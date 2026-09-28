import {
  createOrganization,
  addUserToOrganization,
} from "@/lib/db/queries/organizations"
import {
  getPreferredWorkspace,
  rememberWorkspace,
} from "@/lib/db/queries/workspaces"
import { findActiveClientContact } from "@/lib/db/queries/client-accounts"
import type { UserRole } from "@/lib/types/database"
import crypto from "crypto"

export type SessionIdentity =
  | { kind: "member"; orgId: string; role: UserRole }
  | { kind: "client"; clientContactId: string; clientAccountId: string }

/**
 * Decide what a signing-in user becomes, for JWT token storage.
 *
 * A membership wins. Otherwise an active client contact gets a portal-only
 * identity and never a workspace. Anyone else gets a personal workspace with
 * the ADMIN role (see CCT-2449 for whether that should stay).
 */
export async function resolveSessionIdentity(
  userId: string,
  email: string
): Promise<SessionIdentity> {
  const existing = await getPreferredWorkspace(userId)
  if (existing) {
    await rememberWorkspace(userId, existing.orgId)
    return { kind: "member", ...existing }
  }

  const contact = await findActiveClientContact(userId)
  if (contact) return { kind: "client", ...contact }

  // Derive org name and slug from email
  const username = email.split("@")[0] ?? "user"
  const name = `${username}'s workspace`
  const suffix = crypto.randomBytes(2).toString("hex") // 4 hex chars
  const slug = `${username.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${suffix}`

  // Create the organization and add user as ADMIN
  const org = await createOrganization(name, slug)
  await addUserToOrganization(org.id, userId, "ADMIN")
  await rememberWorkspace(userId, org.id)

  return { kind: "member", orgId: org.id, role: "ADMIN" }
}
