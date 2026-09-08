import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { PgAdapter } from "@/lib/auth/adapter"
import pool from "@/lib/db/pool"
import authConfig from "./auth.config"
import { ensureUserOrganization } from "@/lib/auth/org-setup"
import { getUserByEmail } from "@/lib/db/queries/users"
import { getOrganizationRole } from "@/lib/db/queries/organizations"
import "@/lib/auth/types"

/**
 * Test-only sign-in provider for the Playwright E2E suite.
 *
 * It is registered only when E2E_AUTH_TOKEN is set — that env var is the gate,
 * and it is never set on a real deployment. It lives here rather than in
 * auth.config.ts because that config is also loaded by the edge proxy, which
 * must not reach the database.
 *
 * Note: a NODE_ENV guard would be useless here. `next build` inlines NODE_ENV
 * as "production" and `next start` sets it at runtime, so any suite running
 * against a production build (which is what CI does) would always fail it.
 */
// Second gate: never on a Vercel production deployment, whatever env is set.
const e2eEnabled =
  !!process.env.E2E_AUTH_TOKEN && process.env.VERCEL_ENV !== "production"

const e2eProviders = e2eEnabled
  ? [
      Credentials({
        name: "E2E test login",
        credentials: { email: {}, token: {} },
        async authorize(credentials) {
          if (credentials?.token !== process.env.E2E_AUTH_TOKEN) return null
          const email =
            typeof credentials.email === "string" ? credentials.email : ""
          if (!email) return null
          const user = await getUserByEmail(email)
          if (!user) return null
          return { id: user.id, email: user.email, name: user.name }
        },
      }),
    ]
  : []

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PgAdapter(pool),
  session: { strategy: "jwt" },
  ...authConfig,
  providers: [...authConfig.providers, ...e2eProviders],
  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) {
        token.id = user.id

        // Auto-create org for new users, or fetch existing membership
        const { orgId, role } = await ensureUserOrganization(
          user.id,
          user.email ?? ""
        )
        token.orgId = orgId
        token.role = role
      }
      // JWTs identify the session; current membership authorizes access. Never
      // provision an organization when refreshing an existing/revoked token.
      if (!token.id || !token.orgId) return null
      const currentRole = await getOrganizationRole(token.orgId, token.id)
      if (!currentRole) return null
      token.role = currentRole
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id
        session.user.role = token.role
        session.user.orgId = token.orgId
      }
      return session
    },
  },
})
