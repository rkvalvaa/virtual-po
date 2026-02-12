"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { RepositorySettings } from "@/components/settings/RepositorySettings"
import { OkrSettings } from "@/components/settings/OkrSettings"
import { CapacitySettings } from "@/components/settings/CapacitySettings"
import { JiraSettings } from "@/components/settings/JiraSettings"
import type { JiraSettingsProps } from "@/components/settings/JiraSettings"
import { LinearSettings } from "@/components/settings/LinearSettings"
import type { LinearSettingsProps } from "@/components/settings/LinearSettings"
import { SlackSettings } from "@/components/settings/SlackSettings"
import type { SlackSettingsProps } from "@/components/settings/SlackSettings"
import { defaultScoringConfig } from "@/config/scoring"

interface SettingsContentProps {
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
  slackIntegration: SlackSettingsProps["integration"]
  slackNotifications: SlackSettingsProps["notifications"]
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

const roleBadgeVariant: Record<string, "default" | "secondary" | "outline"> = {
  ADMIN: "default",
  REVIEWER: "secondary",
  STAKEHOLDER: "outline",
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
  slackIntegration,
  slackNotifications,
}: SettingsContentProps) {
  const scoringSettings = organization.settings?.scoring as
    | Record<string, unknown>
    | undefined
  const frameworkName =
    (scoringSettings?.framework as string) ?? defaultScoringConfig.framework
  const weights = {
    business:
      (scoringSettings?.weights as Record<string, number>)?.business ??
      defaultScoringConfig.weights.business,
    technical:
      (scoringSettings?.weights as Record<string, number>)?.technical ??
      defaultScoringConfig.weights.technical,
    risk:
      (scoringSettings?.weights as Record<string, number>)?.risk ??
      defaultScoringConfig.weights.risk,
  }
  const thresholds = {
    highPriority:
      (scoringSettings?.thresholds as Record<string, number>)?.highPriority ??
      defaultScoringConfig.thresholds.highPriority,
    mediumPriority:
      (scoringSettings?.thresholds as Record<string, number>)
        ?.mediumPriority ?? defaultScoringConfig.thresholds.mediumPriority,
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-sm">
          Manage your organization settings and preferences.
        </p>
      </div>

      <Tabs defaultValue="organization">
        <TabsList>
          <TabsTrigger value="organization">Organization</TabsTrigger>
          <TabsTrigger value="scoring">Scoring</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="repositories">Repositories</TabsTrigger>
          <TabsTrigger value="okrs">OKRs</TabsTrigger>
          <TabsTrigger value="capacity">Capacity</TabsTrigger>
          <TabsTrigger value="jira">Jira</TabsTrigger>
          <TabsTrigger value="linear">Linear</TabsTrigger>
          <TabsTrigger value="slack">Slack</TabsTrigger>
        </TabsList>

        <TabsContent value="organization">
          <Card>
            <CardHeader>
              <CardTitle>Organization Details</CardTitle>
              <CardDescription>
                Your organization information. Editing will be available in a
                future update.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-1">
                <p className="text-muted-foreground text-sm font-medium">
                  Name
                </p>
                <p className="text-sm">{organization.name}</p>
              </div>
              <Separator />
              <div className="grid gap-1">
                <p className="text-muted-foreground text-sm font-medium">
                  Slug
                </p>
                <p className="text-sm font-mono">{organization.slug}</p>
              </div>
              <Separator />
              <div className="grid gap-1">
                <p className="text-muted-foreground text-sm font-medium">
                  Created
                </p>
                <p className="text-sm">{formatDate(organization.createdAt)}</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="scoring">
          <Card>
            <CardHeader>
              <CardTitle>Scoring Configuration</CardTitle>
              <CardDescription>
                Priority scoring framework and weights. Editing will be
                available in a future update.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-1">
                <p className="text-muted-foreground text-sm font-medium">
                  Framework
                </p>
                <p className="text-sm">{frameworkName}</p>
              </div>

              <Separator />

              <div className="space-y-3">
                <p className="text-muted-foreground text-sm font-medium">
                  Weights
                </p>
                <div className="flex h-8 w-full overflow-hidden rounded-md">
                  <div
                    className="bg-primary flex items-center justify-center text-xs font-medium text-primary-foreground"
                    style={{ width: `${weights.business * 100}%` }}
                  >
                    Business {Math.round(weights.business * 100)}%
                  </div>
                  <div
                    className="bg-secondary flex items-center justify-center text-xs font-medium text-secondary-foreground"
                    style={{ width: `${weights.technical * 100}%` }}
                  >
                    Technical {Math.round(weights.technical * 100)}%
                  </div>
                  <div
                    className="bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground"
                    style={{ width: `${weights.risk * 100}%` }}
                  >
                    Risk {Math.round(weights.risk * 100)}%
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <p className="text-muted-foreground text-sm font-medium">
                  Priority Thresholds
                </p>
                <div className="grid gap-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <span className="bg-green-500 inline-block h-2.5 w-2.5 rounded-full" />
                      High Priority
                    </span>
                    <span className="text-muted-foreground">
                      Score &ge; {thresholds.highPriority}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <span className="bg-yellow-500 inline-block h-2.5 w-2.5 rounded-full" />
                      Medium Priority
                    </span>
                    <span className="text-muted-foreground">
                      Score &ge; {thresholds.mediumPriority}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <span className="bg-muted-foreground inline-block h-2.5 w-2.5 rounded-full" />
                      Low Priority
                    </span>
                    <span className="text-muted-foreground">
                      Score &lt; {thresholds.mediumPriority}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="members">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Members</CardTitle>
                  <CardDescription>
                    {members.length} member{members.length !== 1 ? "s" : ""} in
                    your organization.
                  </CardDescription>
                </div>
                {userRole === "ADMIN" && (
                  <Button disabled title="Coming soon">
                    Invite Member
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Joined</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((member) => (
                    <TableRow
                      key={member.userId}
                      className={
                        member.userId === currentUserId
                          ? "bg-muted/50"
                          : undefined
                      }
                    >
                      <TableCell className="font-medium">
                        {member.userName ?? "Unknown"}
                        {member.userId === currentUserId && (
                          <span className="text-muted-foreground ml-2 text-xs">
                            (you)
                          </span>
                        )}
                      </TableCell>
                      <TableCell>{member.userEmail}</TableCell>
                      <TableCell>
                        <Badge
                          variant={roleBadgeVariant[member.role] ?? "outline"}
                        >
                          {member.role}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(member.joinedAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="repositories">
          <RepositorySettings repositories={repositories} />
        </TabsContent>

        <TabsContent value="okrs">
          <OkrSettings objectives={objectives} userRole={userRole} />
        </TabsContent>

        <TabsContent value="capacity">
          <CapacitySettings
            capacity={capacity}
            currentQuarter={currentQuarter}
            userRole={userRole}
          />
        </TabsContent>

        <TabsContent value="jira">
          <JiraSettings
            integration={jiraIntegration}
            syncHistory={jiraSyncHistory}
            userRole={userRole}
          />
        </TabsContent>

        <TabsContent value="linear">
          <LinearSettings
            integration={linearIntegration}
            syncHistory={linearSyncHistory}
            userRole={userRole}
          />
        </TabsContent>

        <TabsContent value="slack">
          <SlackSettings
            integration={slackIntegration}
            notifications={slackNotifications}
            userRole={userRole}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
