import NextAuth from "next-auth"
import authConfig from "./auth.config"

const { auth } = NextAuth(authConfig)

// These handlers authenticate API keys, signed Slack requests, or cron tokens
// themselves. Keep this list explicit; other APIs still require a user session.
function usesMachineAuthentication(pathname: string): boolean {
  return pathname === "/api/v1" || pathname.startsWith("/api/v1/") || [
    "/api/slack/commands", "/api/slack/events", "/api/slack/interactions",
    "/api/cron/review-cycles", "/api/cron/webhooks", "/api/health",
  ].includes(pathname)
}

export const proxy = auth((req) => {
  const { pathname } = req.nextUrl
  const isLoggedIn = !!req.auth

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
  if (pathname === "/" || pathname === "/login") {
    // Only the server session can determine whether membership was revoked.
    // A stale JWT must not bounce a revoked user away from the login page.
    return
  }

  // Protected routes
  if (!isLoggedIn) {
    return Response.redirect(new URL("/login", req.nextUrl.origin))
  }
})

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
}
