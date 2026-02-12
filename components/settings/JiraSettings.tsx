"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  connectJira,
  disconnectJira,
  testJiraConnection,
} from "@/app/(dashboard)/settings/jira-actions"

export interface JiraSettingsProps {
  integration: {
    id: string
    siteUrl: string
    email: string
    defaultProjectKey: string
    isActive: boolean
    connectedAt: string
  } | null
  syncHistory: Array<{
    id: string
    entityType: string
    jiraKey: string
    syncDirection: string
    syncStatus: string
    errorMessage: string | null
    syncedAt: string
  }>
  userRole: string
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

const statusVariant: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  SUCCESS: "default",
  FAILED: "destructive",
  PENDING: "secondary",
}

const directionVariant: Record<string, "default" | "secondary" | "outline"> = {
  PUSH: "default",
  PULL: "secondary",
}

export function JiraSettings({
  integration,
  syncHistory,
  userRole,
}: JiraSettingsProps) {
  const [isPending, startTransition] = useTransition()
  const [testResult, setTestResult] = useState<{
    success: boolean
    message: string
  } | null>(null)
  const [connectError, setConnectError] = useState<string | null>(null)

  const isAdmin = userRole === "ADMIN"

  function handleConnect(formData: FormData) {
    setConnectError(null)
    startTransition(async () => {
      const result = await connectJira(formData)
      if (!result.success) {
        setConnectError(result.error ?? "Failed to connect.")
      }
    })
  }

  function handleDisconnect() {
    startTransition(async () => {
      await disconnectJira()
      setTestResult(null)
    })
  }

  function handleTestConnection() {
    setTestResult(null)
    startTransition(async () => {
      const result = await testJiraConnection()
      if (result.success) {
        const count = result.projects?.length ?? 0
        setTestResult({
          success: true,
          message: `Connection successful. Found ${count} project${count !== 1 ? "s" : ""}.`,
        })
      } else {
        setTestResult({
          success: false,
          message: result.error ?? "Connection failed.",
        })
      }
    })
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Jira Integration</CardTitle>
          <CardDescription>
            {integration
              ? "Your Jira instance is connected. Sync epics and stories to Jira."
              : "Connect your Jira instance to push epics and stories."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!integration && isAdmin && (
            <form action={handleConnect} className="space-y-4">
              <div className="grid gap-1.5">
                <label htmlFor="siteUrl" className="text-sm font-medium">
                  Site URL
                </label>
                <Input
                  id="siteUrl"
                  name="siteUrl"
                  placeholder="https://your-site.atlassian.net"
                  required
                  disabled={isPending}
                />
              </div>
              <div className="grid gap-1.5">
                <label htmlFor="email" className="text-sm font-medium">
                  Email
                </label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  required
                  disabled={isPending}
                />
              </div>
              <div className="grid gap-1.5">
                <label htmlFor="apiToken" className="text-sm font-medium">
                  API Token
                </label>
                <Input
                  id="apiToken"
                  name="apiToken"
                  type="password"
                  placeholder="Your Jira API token"
                  required
                  disabled={isPending}
                />
              </div>
              <div className="grid gap-1.5">
                <label htmlFor="defaultProjectKey" className="text-sm font-medium">
                  Default Project Key
                </label>
                <Input
                  id="defaultProjectKey"
                  name="defaultProjectKey"
                  placeholder="PROJ"
                  disabled={isPending}
                />
              </div>
              {connectError && (
                <p className="text-destructive text-sm">{connectError}</p>
              )}
              <Button type="submit" disabled={isPending}>
                {isPending ? "Connecting..." : "Connect to Jira"}
              </Button>
            </form>
          )}

          {!integration && !isAdmin && (
            <p className="text-muted-foreground text-sm">
              Only admins can configure the Jira integration.
            </p>
          )}

          {integration && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Badge variant="default" className="bg-green-600">
                  Connected
                </Badge>
                <span className="text-muted-foreground text-sm">
                  {integration.siteUrl}
                </span>
              </div>
              <div className="text-muted-foreground grid gap-1 text-sm">
                <p>
                  <span className="font-medium text-foreground">Email:</span>{" "}
                  {integration.email}
                </p>
                {integration.defaultProjectKey && (
                  <p>
                    <span className="font-medium text-foreground">
                      Default Project:
                    </span>{" "}
                    {integration.defaultProjectKey}
                  </p>
                )}
                <p>
                  <span className="font-medium text-foreground">
                    Connected:
                  </span>{" "}
                  {formatDate(integration.connectedAt)}
                </p>
              </div>

              {testResult && (
                <p
                  className={`text-sm ${testResult.success ? "text-green-600" : "text-destructive"}`}
                >
                  {testResult.message}
                </p>
              )}

              {isAdmin && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isPending}
                    onClick={handleTestConnection}
                  >
                    {isPending ? "Testing..." : "Test Connection"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isPending}
                    onClick={handleDisconnect}
                    className="text-destructive"
                  >
                    Disconnect
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sync History</CardTitle>
          <CardDescription>
            Recent synchronization activity with Jira.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {syncHistory.length === 0 ? (
            <div className="text-muted-foreground px-6 py-8 text-center text-sm">
              No sync history.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entity</TableHead>
                  <TableHead>Jira Key</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {syncHistory.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="text-sm">
                      {entry.entityType}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {entry.jiraKey || "--"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          directionVariant[entry.syncDirection] ?? "outline"
                        }
                      >
                        {entry.syncDirection}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          statusVariant[entry.syncStatus] ?? "outline"
                        }
                      >
                        {entry.syncStatus}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDate(entry.syncedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
