import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { NextResponse } from "next/server"
import type { UserRole } from "@/lib/types/database"
import type { Session } from "next-auth"
import { canAccess } from "@/lib/auth/rbac"
import "@/lib/auth/types"

/**
 * Get the current session or redirect to login.
 * Use in Server Components and Server Actions.
 */
export async function requireAuth(): Promise<Session> {
  const session = await auth()
  if (!session?.user) {
    redirect("/login")
  }
  return session
}

/**
 * Require a minimum role level, redirect if insufficient.
 * Role hierarchy: ADMIN > REVIEWER > STAKEHOLDER
 */
export async function requireRole(requiredRole: UserRole): Promise<Session> {
  const session = await requireAuth()
  if (!canAccess(session.user.role as UserRole, requiredRole)) {
    redirect("/unauthorized")
  }
  return session
}

/**
 * Wrapper for API route handlers that injects session.
 * Returns 401 if not authenticated.
 */
export function withAuth(
  handler: (req: Request, session: Session) => Promise<Response>
) {
  return async (req: Request) => {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    return handler(req, session)
  }
}
