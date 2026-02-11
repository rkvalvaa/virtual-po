import type { UserRole } from "@/lib/types/database"

const ROLE_LEVELS: Record<UserRole, number> = {
  STAKEHOLDER: 0,
  REVIEWER: 1,
  ADMIN: 2,
}

/**
 * Check if a user's role meets or exceeds the required role level.
 * Hierarchy: ADMIN > REVIEWER > STAKEHOLDER
 */
export function canAccess(userRole: UserRole, requiredRole: UserRole): boolean {
  return ROLE_LEVELS[userRole] >= ROLE_LEVELS[requiredRole]
}
