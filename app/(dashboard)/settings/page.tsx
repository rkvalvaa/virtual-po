import { requireAuth } from "@/lib/auth/session"
import { getOrganizationById, getOrganizationUsers } from "@/lib/db/queries/organizations"
import { getRepositoriesByOrgId } from "@/lib/db/queries/repositories"
import { getObjectivesWithKeyResults } from "@/lib/db/queries/okrs"
import { getCurrentQuarterCapacity } from "@/lib/db/queries/capacity"
import { getIntegrationByType, getJiraSyncHistory } from "@/lib/db/queries/jira-sync"
import { getLinearSyncHistory } from "@/lib/db/queries/linear-sync"
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

  const [organization, orgUsers, repositories, objectivesWithKr, capacityRows, jiraIntegration, jiraSyncHistory, linearIntegration, linearSyncHistory] = await Promise.all([
    getOrganizationById(orgId),
    getOrganizationUsers(orgId),
    getRepositoriesByOrgId(orgId),
    getObjectivesWithKeyResults(orgId),
    getCurrentQuarterCapacity(orgId),
    getIntegrationByType(orgId, "JIRA"),
    getJiraSyncHistory(orgId),
    getIntegrationByType(orgId, "LINEAR"),
    getLinearSyncHistory(orgId),
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
      jiraIntegration={
        jiraIntegration
          ? {
              id: jiraIntegration.id,
              siteUrl: (jiraIntegration.config.baseUrl as string) ?? "",
              email: (jiraIntegration.config.email as string) ?? "",
              defaultProjectKey: (jiraIntegration.config.defaultProjectKey as string) ?? "",
              isActive: jiraIntegration.isActive,
              connectedAt: jiraIntegration.createdAt.toISOString(),
            }
          : null
      }
      jiraSyncHistory={jiraSyncHistory.map((log) => ({
        id: log.id,
        entityType: log.entityType,
        jiraKey: log.jiraKey,
        syncDirection: log.syncDirection,
        syncStatus: log.syncStatus,
        errorMessage: log.errorMessage,
        syncedAt: log.syncedAt.toISOString(),
      }))}
      linearIntegration={
        linearIntegration
          ? {
              id: linearIntegration.id,
              defaultTeamId: (linearIntegration.config.defaultTeamId as string) || null,
              isActive: linearIntegration.isActive,
              connectedAt: linearIntegration.createdAt.toISOString(),
            }
          : null
      }
      linearSyncHistory={linearSyncHistory.map((log) => ({
        id: log.id,
        entityType: log.entityType,
        linearId: log.linearId,
        syncDirection: log.syncDirection,
        syncStatus: log.syncStatus,
        errorMessage: log.errorMessage,
        syncedAt: log.syncedAt.toISOString(),
      }))}
    />
  )
}
