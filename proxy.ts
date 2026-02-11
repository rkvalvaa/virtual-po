import NextAuth from "next-auth"
import authConfig from "./auth.config"

const { auth } = NextAuth(authConfig)

export const proxy = auth((req) => {
  const { pathname } = req.nextUrl
  const isLoggedIn = !!req.auth

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
    // Redirect authenticated users away from login
    if (isLoggedIn && pathname === "/login") {
      return Response.redirect(new URL("/", req.nextUrl.origin))
    }
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
