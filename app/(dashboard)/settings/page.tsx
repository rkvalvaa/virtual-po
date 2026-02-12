import { requireAuth } from "@/lib/auth/session"
import { getOrganizationById, getOrganizationUsers } from "@/lib/db/queries/organizations"
import { getRepositoriesByOrgId } from "@/lib/db/queries/repositories"
import { getObjectivesWithKeyResults } from "@/lib/db/queries/okrs"
import { getCurrentQuarterCapacity } from "@/lib/db/queries/capacity"
import { getIntegrationByType, getJiraSyncHistory } from "@/lib/db/queries/jira-sync"
import { getLinearSyncHistory } from "@/lib/db/queries/linear-sync"
import { getGitHubSyncHistory } from "@/lib/db/queries/github-sync"
import { getSlackNotifications } from "@/lib/db/queries/slack"
import { getApiKeysByOrg } from "@/lib/db/queries/api-keys"
import { getWebhooksByOrg } from "@/lib/db/queries/webhooks"
import { getAllTemplates, seedDefaultTemplates } from "@/lib/db/queries/templates"
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

  await seedDefaultTemplates(orgId)

  const [organization, orgUsers, repositories, objectivesWithKr, capacityRows, jiraIntegration, jiraSyncHistory, linearIntegration, linearSyncHistory, githubIssuesIntegration, githubSyncHistory, slackIntegration, slackNotifications, apiKeys, webhookSubscriptions, allTemplates] = await Promise.all([
    getOrganizationById(orgId),
    getOrganizationUsers(orgId),
    getRepositoriesByOrgId(orgId),
    getObjectivesWithKeyResults(orgId),
    getCurrentQuarterCapacity(orgId),
    getIntegrationByType(orgId, "JIRA"),
    getJiraSyncHistory(orgId),
    getIntegrationByType(orgId, "LINEAR"),
    getLinearSyncHistory(orgId),
    getIntegrationByType(orgId, "GITHUB_ISSUES"),
    getGitHubSyncHistory(orgId),
    getIntegrationByType(orgId, "SLACK"),
    getSlackNotifications(orgId),
    getApiKeysByOrg(orgId),
    getWebhooksByOrg(orgId),
    getAllTemplates(orgId),
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
      githubIssuesIntegration={
        githubIssuesIntegration
          ? {
              id: githubIssuesIntegration.id,
              defaultRepo: (githubIssuesIntegration.config.defaultRepo as string) ?? "",
              defaultProjectId: (githubIssuesIntegration.config.defaultProjectId as string) || null,
              isActive: githubIssuesIntegration.isActive,
              connectedAt: githubIssuesIntegration.createdAt.toISOString(),
            }
          : null
      }
      githubSyncHistory={githubSyncHistory.map((log) => ({
        id: log.id,
        entityType: log.entityType,
        githubIssueNumber: log.githubIssueNumber,
        syncDirection: log.syncDirection,
        syncStatus: log.syncStatus,
        errorMessage: log.errorMessage,
        syncedAt: log.syncedAt.toISOString(),
      }))}
      slackIntegration={
        slackIntegration
          ? {
              id: slackIntegration.id,
              appId: (slackIntegration.config.appId as string) ?? "",
              isActive: slackIntegration.isActive,
              connectedAt: slackIntegration.createdAt.toISOString(),
            }
          : null
      }
      slackNotifications={slackNotifications.map((n) => ({
        id: n.id,
        channelName: n.channelName,
        eventType: n.eventType,
        isActive: n.isActive,
      }))}
      apiKeys={apiKeys.map((k) => ({
        id: k.id,
        name: k.name,
        keyPrefix: k.keyPrefix,
        scopes: k.scopes,
        lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
        expiresAt: k.expiresAt?.toISOString() ?? null,
        isActive: k.isActive,
        createdAt: k.createdAt.toISOString(),
      }))}
      webhooks={webhookSubscriptions.map((w) => ({
        id: w.id,
        url: w.url,
        events: w.events,
        isActive: w.isActive,
        lastTriggeredAt: w.lastTriggeredAt?.toISOString() ?? null,
        failureCount: w.failureCount,
        createdAt: w.createdAt.toISOString(),
      }))}
      templates={allTemplates.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        category: t.category,
        icon: t.icon,
        defaultTitle: t.defaultTitle,
        promptHints: t.promptHints,
        isActive: t.isActive,
        sortOrder: t.sortOrder,
      }))}
    />
  )
}
