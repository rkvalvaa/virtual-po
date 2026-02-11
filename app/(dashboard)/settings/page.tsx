import { requireAuth } from "@/lib/auth/session"
import { getOrganizationById, getOrganizationUsers } from "@/lib/db/queries/organizations"
import "@/lib/auth/types"
import { SettingsContent } from "./SettingsContent"

export default async function SettingsPage() {
  const session = await requireAuth()
  const orgId = session.user.orgId

  if (!orgId) {
    return (
      <div className="text-muted-foreground py-12 text-center text-sm">
        No organization found. Please contact an administrator.
      </div>
    )
  }

  const [organization, orgUsers] = await Promise.all([
    getOrganizationById(orgId),
    getOrganizationUsers(orgId),
  ])

  if (!organization) {
    return (
      <div className="text-muted-foreground py-12 text-center text-sm">
        Organization not found.
      </div>
    )
  }

  const members = orgUsers.map((ou) => ({
    userId: ou.user.id,
    userName: ou.user.name,
    userEmail: ou.user.email,
    role: ou.role,
    joinedAt: ou.createdAt.toISOString(),
  }))

  return (
    <SettingsContent
      organization={{
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        settings: organization.settings,
        createdAt: organization.createdAt.toISOString(),
      }}
      members={members}
      userRole={session.user.role}
      currentUserId={session.user.id}
    />
  )
}
