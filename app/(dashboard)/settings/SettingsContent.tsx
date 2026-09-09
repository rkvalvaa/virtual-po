"use client"

import { SettingsSections, SettingsNavigation, SettingsPanel } from "@/components/settings/SettingsSections"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { RepositorySettings } from "@/components/settings/RepositorySettings"
import { OkrSettings } from "@/components/settings/OkrSettings"
import { CapacitySettings } from "@/components/settings/CapacitySettings"
import { JiraSettings } from "@/components/settings/JiraSettings"
import type { JiraSettingsProps } from "@/components/settings/JiraSettings"
import { LinearSettings } from "@/components/settings/LinearSettings"
import type { LinearSettingsProps } from "@/components/settings/LinearSettings"
import { GitHubIssuesSettings } from "@/components/settings/GitHubIssuesSettings"
import type { GitHubIssuesSettingsProps } from "@/components/settings/GitHubIssuesSettings"
import { SlackSettings } from "@/components/settings/SlackSettings"
import type { SlackSettingsProps } from "@/components/settings/SlackSettings"
import { TeamsSettings } from "@/components/settings/TeamsSettings"
import type { TeamsSettingsProps } from "@/components/settings/TeamsSettings"
import { ApiKeySettings } from "@/components/settings/ApiKeySettings"
import type { ApiKeySettingsProps } from "@/components/settings/ApiKeySettings"
import { WebhookSettings } from "@/components/settings/WebhookSettings"
import type { WebhookSettingsProps } from "@/components/settings/WebhookSettings"
import { TemplateSettings } from "@/components/settings/TemplateSettings"
import type { TemplateSettingsProps } from "@/components/settings/TemplateSettings"
import { CustomFieldSettings } from "@/components/settings/CustomFieldSettings"
import type { CustomFieldSettingsProps } from "@/components/settings/CustomFieldSettings"
import { EmailPreferencesSettings } from "@/components/settings/EmailPreferencesSettings"
import { ApprovalSettings } from "@/components/settings/ApprovalSettings"
import type { ApprovalSettingsProps } from "@/components/settings/ApprovalSettings"
import { ReviewCycleSettings } from "@/components/settings/ReviewCycleSettings"
import type { ReviewCycleSettingsProps } from "@/components/settings/ReviewCycleSettings"
import type { NotificationType } from "@/lib/types/database"
import { defaultScoringConfig } from "@/config/scoring"
import type { ScoringPolicy } from '@/config/scoring-policy'
import { ScoringSettings } from '@/components/settings/ScoringSettings'
import { OrganizationSettings } from "@/components/settings/OrganizationSettings"
import { MemberSettings } from "@/components/settings/MemberSettings"
import { InvitationSettings } from '@/components/settings/InvitationSettings'
import type { PendingInvitation } from '@/lib/db/queries/invitations'

interface SettingsContentProps {
  scoringPolicy?: ScoringPolicy
  invitations?: PendingInvitation[]
  invitationReadiness?: string | null
  administrationHistory?: { id: string; action: string; metadata: Record<string, unknown>; userName: string | null; createdAt: string }[]
  organization: {
    id: string
    name: string
    slug: string
    settings: Record<string, unknown>
    createdAt: string
  }
  members: Array<{
    userId: string
    userName: string | null
    userEmail: string
    role: string
    joinedAt: string
  }>
  userRole: string
  currentUserId: string
  repositories: Array<{
    id: string
    fullName: string
    owner: string
    name: string
    defaultBranch: string
    connectedAt: string
  }>
  objectives: Array<{
    id: string
    title: string
    description: string | null
    timeFrame: string
    status: string
    keyResults: Array<{
      id: string
      title: string
      targetValue: number
      currentValue: number
      unit: string
    }>
  }>
  capacity: {
    quarter: string
    totalCapacityDays: number
    allocatedDays: number
    notes: string | null
  } | null
  currentQuarter: string
  jiraIntegration: JiraSettingsProps["integration"]
  jiraSyncHistory: JiraSettingsProps["syncHistory"]
  linearIntegration: LinearSettingsProps["integration"]
  linearSyncHistory: LinearSettingsProps["syncHistory"]
  githubIssuesIntegration: GitHubIssuesSettingsProps["integration"]
  githubSyncHistory: GitHubIssuesSettingsProps["syncHistory"]
  slackIntegration: SlackSettingsProps["integration"]
  slackNotifications: SlackSettingsProps["notifications"]
  teamsIntegration: TeamsSettingsProps["integration"]
  teamsNotifications: TeamsSettingsProps["notifications"]
  apiKeys: ApiKeySettingsProps["apiKeys"]
  webhooks: WebhookSettingsProps["webhooks"]
  templates: TemplateSettingsProps["templates"]
  customFields: CustomFieldSettingsProps["customFields"]
  approvalWorkflow: ApprovalSettingsProps["workflow"]
  reviewCycleConfig: ReviewCycleSettingsProps["config"]
  reviewCycles: ReviewCycleSettingsProps["cycles"]
  emailPreferences: Record<NotificationType, boolean>
}

export function SettingsContent({
  organization,
  members,
  userRole,
  currentUserId,
  repositories,
  objectives,
  capacity,
  currentQuarter,
  jiraIntegration,
  jiraSyncHistory,
  linearIntegration,
  linearSyncHistory,
  githubIssuesIntegration,
  githubSyncHistory,
  slackIntegration,
  slackNotifications,
  teamsIntegration,
  teamsNotifications,
  apiKeys,
  webhooks,
  templates,
  customFields,
  approvalWorkflow,
  reviewCycleConfig,
  reviewCycles,
  emailPreferences,
  invitations = [],
  invitationReadiness = null,
  administrationHistory = [],
  scoringPolicy = { version: 0, config: defaultScoringConfig },
}: SettingsContentProps) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-sm">
          Manage your organization settings and preferences.
        </p>
      </div>

      <SettingsSections defaultValue="organization">
        <SettingsNavigation />

        <SettingsPanel value="organization">
          <OrganizationSettings organization={organization} userRole={userRole} />
        </SettingsPanel>

        <SettingsPanel value="scoring">
          <ScoringSettings policy={scoringPolicy} userRole={userRole} />
        </SettingsPanel>

        <SettingsPanel value="members">
          <MemberSettings members={members} currentUserId={currentUserId} userRole={userRole} />
          {userRole === 'ADMIN' && <div className="mt-4 space-y-4">
            <InvitationSettings invitations={invitations} readiness={invitationReadiness} />
            <Card><CardHeader><CardTitle>Administration history</CardTitle></CardHeader><CardContent className="space-y-3">
              {!administrationHistory.length && <p className="text-sm text-muted-foreground">No administration changes recorded.</p>}
              {administrationHistory.map(event => <div key={event.id} className="border-b pb-2 text-sm">
                <p>{event.userName ?? 'Member'} · {event.action.replaceAll('_', ' ').toLowerCase()} · {new Date(event.createdAt).toLocaleString()}</p>
                <p className="break-words text-muted-foreground">{Object.entries(event.metadata).map(([key, value]) => `${key}: ${String(value)}`).join(' · ')}</p>
              </div>)}
            </CardContent></Card>
          </div>}
        </SettingsPanel>

        <SettingsPanel value="repositories">
          <RepositorySettings repositories={repositories} userRole={userRole} />
        </SettingsPanel>

        <SettingsPanel value="okrs">
          <OkrSettings objectives={objectives} userRole={userRole} />
        </SettingsPanel>

        <SettingsPanel value="capacity">
          <CapacitySettings
            capacity={capacity}
            currentQuarter={currentQuarter}
            userRole={userRole}
          />
        </SettingsPanel>

        <SettingsPanel value="jira">
          <JiraSettings
            integration={jiraIntegration}
            syncHistory={jiraSyncHistory}
            userRole={userRole}
          />
        </SettingsPanel>

        <SettingsPanel value="linear">
          <LinearSettings
            integration={linearIntegration}
            syncHistory={linearSyncHistory}
            userRole={userRole}
          />
        </SettingsPanel>

        <SettingsPanel value="github-issues">
          <GitHubIssuesSettings
            integration={githubIssuesIntegration}
            syncHistory={githubSyncHistory}
            userRole={userRole}
            repositories={repositories}
          />
        </SettingsPanel>

        <SettingsPanel value="slack">
          <SlackSettings
            integration={slackIntegration}
            notifications={slackNotifications}
            userRole={userRole}
          />
        </SettingsPanel>

        <SettingsPanel value="teams">
          <TeamsSettings
            integration={teamsIntegration}
            notifications={teamsNotifications}
            userRole={userRole}
          />
        </SettingsPanel>

        <SettingsPanel value="api-keys">
          <ApiKeySettings apiKeys={apiKeys} userRole={userRole} />
        </SettingsPanel>

        <SettingsPanel value="webhooks">
          <WebhookSettings webhooks={webhooks} userRole={userRole} />
        </SettingsPanel>

        <SettingsPanel value="templates">
          <TemplateSettings templates={templates} userRole={userRole} />
        </SettingsPanel>

        <SettingsPanel value="custom-fields">
          <CustomFieldSettings customFields={customFields} userRole={userRole} />
        </SettingsPanel>

        <SettingsPanel value="approvals">
          <ApprovalSettings
            workflow={approvalWorkflow}
            members={members}
            userRole={userRole}
          />
        </SettingsPanel>

        <SettingsPanel value="review-cycles">
          <ReviewCycleSettings
            config={reviewCycleConfig}
            cycles={reviewCycles}
            userRole={userRole}
          />
        </SettingsPanel>

        <SettingsPanel value="email">
          <EmailPreferencesSettings preferences={emailPreferences} />
        </SettingsPanel>
      </SettingsSections>
    </div>
  )
}
