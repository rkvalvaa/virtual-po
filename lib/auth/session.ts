import { auth } from "@/auth"
import { redirect } from "next/navigation"
import type { UserRole } from "@/lib/types/database"
import type { Session } from "next-auth"
import "@/lib/auth/types"

/** A session that belongs to a workspace member, never a client contact. */
export type MemberSession = Session & {
  user: Session["user"] & { orgId: string; role: UserRole }
}

/**
 * Get the current workspace member's session or redirect.
 * Use in Server Components and Server Actions. This is the boundary that keeps
 * client contacts out of the workspace: a Server Action can be POSTed to any
 * page path, including /portal, so the proxy alone is not enough.
 */
export async function requireAuth(): Promise<MemberSession> {
  const session = await auth()
  if (!session?.user) {
    redirect("/login")
  }
  if (!session.user.orgId || !session.user.role) {
    redirect(session.user.clientContactId ? "/portal" : "/login")
  }
  return session as MemberSession
}

/** Get the current client contact or redirect. Use in portal code only. */
export async function requirePortalContact(): Promise<{ userId: string; clientContactId: string; clientAccountId: string }> {
  const session = await auth()
  if (!session?.user) {
    redirect("/portal/login")
  }
  const { id, clientContactId, clientAccountId } = session.user
  if (!clientContactId || !clientAccountId) {
    redirect("/requests")
  }
  return { userId: id, clientContactId, clientAccountId }
}
