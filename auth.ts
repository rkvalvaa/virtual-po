import NextAuth from "next-auth"
import { PgAdapter } from "@/lib/auth/adapter"
import pool from "@/lib/db/pool"
import authConfig from "./auth.config"
import { ensureUserOrganization } from "@/lib/auth/org-setup"
import "@/lib/auth/types"

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PgAdapter(pool),
  session: { strategy: "jwt" },
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
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
