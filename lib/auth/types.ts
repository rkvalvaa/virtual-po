import type { UserRole } from "@/lib/types/database"
import type { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: UserRole
      orgId: string | null
    } & DefaultSession["user"]
  }

  interface User {
    role?: UserRole
    orgId?: string | null
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string
    role: UserRole
    orgId: string | null
  }
}
