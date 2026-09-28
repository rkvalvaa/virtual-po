import type { UserRole } from "@/lib/types/database"
import type { DefaultSession } from "next-auth"

// A session is either a workspace member (orgId + role) or a client contact
// (clientContactId + clientAccountId, no orgId, no role). Never both.
declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: UserRole | null
      orgId: string | null
      clientContactId?: string | null
      clientAccountId?: string | null
    } & DefaultSession["user"]
  }

  interface User {
    role?: UserRole | null
    orgId?: string | null
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string
    role: UserRole | null
    orgId: string | null
    clientContactId?: string | null
    clientAccountId?: string | null
  }
}
