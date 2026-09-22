import type { NextRequest } from "next/server"
import { getToken } from "next-auth/jwt"

// These handlers authenticate API keys, signed Slack requests, or cron tokens
// themselves. Keep this list explicit; other APIs still require a user session.
function usesMachineAuthentication(pathname: string): boolean {
  return pathname === "/api/v1" || pathname.startsWith("/api/v1/") || [
    "/api/slack/commands", "/api/slack/events", "/api/slack/interactions",
    "/api/cron/review-cycles", "/api/cron/webhooks", "/api/cron/email",
    "/api/cron/tracker-status-sync",
    "/api/webhooks/resend", "/api/teams/messages", "/api/cron/teams", "/api/health",
  ].includes(pathname)
}

const SECURE_SESSION_COOKIE = "__Secure-authjs.session-token"

/**
 * Read-only session check. The Auth.js `auth()` middleware wrapper re-issues
 * the session cookie on every response, so a slow prefetch finishing after a
 * workspace switch would overwrite the new token with the stale one. Decoding
 * the JWT directly sets nothing.
 */
async function hasSession(req: NextRequest): Promise<boolean> {
  // Fail closed: an empty secret would let a token forged with an empty key through.
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error("AUTH_SECRET is required")
  // Auth.js chunks large cookies (`name.0`, `name.1`), so match by prefix.
  const secureCookie = req.cookies.getAll().some(c => c.name.startsWith(SECURE_SESSION_COOKIE))
  const token = await getToken({ req, secret, secureCookie })
  return token !== null
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (usesMachineAuthentication(pathname)) return

  // Always allow auth API routes and static assets
  if (
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico")
  ) {
    return
  }

  // Public routes that don't require authentication
  if (pathname === "/" || pathname === "/login" || /^\/invite\/[a-f0-9]{64}$/.test(pathname)) {
    // Only the server session can determine whether membership was revoked.
    // A stale JWT must not bounce a revoked user away from the login page.
    return
  }

  // Protected routes
  if (!(await hasSession(req))) {
    return Response.redirect(new URL("/login", req.nextUrl.origin))
  }
}

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
}
