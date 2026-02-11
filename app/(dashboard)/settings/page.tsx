import { requireAuth } from "@/lib/auth/session"
import { getOrganizationById, getOrganizationUsers } from "@/lib/db/queries/organizations"
import { getRepositoriesByOrgId } from "@/lib/db/queries/repositories"
import { getObjectivesWithKeyResults } from "@/lib/db/queries/okrs"
import { getCurrentQuarterCapacity } from "@/lib/db/queries/capacity"
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

  const [organization, orgUsers, repositories, objectivesWithKr, capacityRows] = await Promise.all([
    getOrganizationById(orgId),
    getOrganizationUsers(orgId),
    getRepositoriesByOrgId(orgId),
    getObjectivesWithKeyResults(orgId),
    getCurrentQuarterCapacity(orgId),
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

  const objectives = objectivesWithKr.map((obj) => ({
    id: obj.id,
    title: obj.title,
    description: obj.description,
    timeFrame: obj.timeFrame,
    status: obj.status,
    keyResults: obj.keyResults.map((kr) => ({
      id: kr.id,
      title: kr.title,
      targetValue: kr.targetValue,
      currentValue: kr.currentValue,
      unit: kr.unit,
    })),
  }))

  const now = new Date()
  const currentQuarter = `${now.getFullYear()}-Q${Math.ceil((now.getMonth() + 1) / 3)}`
  const capacityRow = capacityRows[0] ?? null
  const capacity = capacityRow
    ? {
        quarter: capacityRow.quarter,
        totalCapacityDays: capacityRow.totalCapacityDays,
        allocatedDays: capacityRow.allocatedDays,
        notes: capacityRow.notes,
      }
    : null

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
      repositories={repositories.map((r) => ({
        id: r.id,
        fullName: r.fullName,
        owner: r.owner,
        name: r.name,
        defaultBranch: r.defaultBranch,
        connectedAt: r.connectedAt.toISOString(),
      }))}
      objectives={objectives}
      capacity={capacity}
      currentQuarter={currentQuarter}
    />
  )
}
