import GitHub from "next-auth/providers/github"
import Google from "next-auth/providers/google"
import type { NextAuthConfig } from "next-auth"

export default {
  providers: [
    GitHub({
      authorization: { params: { scope: "read:user user:email repo" } },
    }),
    Google,
  ],
  pages: {
    signIn: "/login",
    error: "/login",
  },
  // Route authorization belongs to proxy.ts. API handlers with non-session
  // authentication must reach their own credential checks without a login gate.
} satisfies NextAuthConfig
