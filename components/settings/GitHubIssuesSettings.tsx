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
  connectGitHubIssues,
  disconnectGitHubIssues,
  testGitHubIssuesConnection,
} from "@/app/(dashboard)/settings/github-issues-actions"

export interface GitHubIssuesSettingsProps {
  integration: {
    id: string
    defaultRepo: string
    defaultProjectId: string | null
    isActive: boolean
    connectedAt: string
  } | null
  syncHistory: Array<{
    id: string
    entityType: string
    githubIssueNumber: number | null
    syncDirection: string
    syncStatus: string
    errorMessage: string | null
    syncedAt: string
  }>
  userRole: string
  repositories: Array<{
    id: string
    fullName: string
    owner: string
    name: string
  }>
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

export function GitHubIssuesSettings({
  integration,
  syncHistory,
  userRole,
  repositories,
}: GitHubIssuesSettingsProps) {
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
      const result = await connectGitHubIssues(formData)
      if (!result.success) {
        setConnectError(result.error ?? "Failed to connect.")
      }
    })
  }

  function handleDisconnect() {
    startTransition(async () => {
      await disconnectGitHubIssues()
      setTestResult(null)
    })
  }

  function handleTestConnection() {
    setTestResult(null)
    startTransition(async () => {
      const result = await testGitHubIssuesConnection()
      if (result.success) {
        setTestResult({
          success: true,
          message: `Connection successful. Repository: ${result.repoName ?? "unknown"}.`,
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
          <CardTitle>GitHub Issues Integration</CardTitle>
          <CardDescription>
            {integration
              ? "Your GitHub repository is connected. Sync epics and stories as GitHub issues."
              : "Connect a GitHub repository to push epics and stories as issues."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!integration && isAdmin && (
            <form action={handleConnect} className="space-y-4">
              <div className="grid gap-1.5">
                <label htmlFor="defaultRepo" className="text-sm font-medium">
                  Default Repository
                </label>
                <select
                  id="defaultRepo"
                  name="defaultRepo"
                  required
                  disabled={isPending}
                  className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">Select a repository</option>
                  {repositories.map((repo) => (
                    <option key={repo.id} value={repo.fullName}>
                      {repo.fullName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <label htmlFor="defaultProjectId" className="text-sm font-medium">
                  Project ID (optional)
                </label>
                <Input
                  id="defaultProjectId"
                  name="defaultProjectId"
                  placeholder="GitHub Projects v2 project ID"
                  disabled={isPending}
                />
              </div>
              {connectError && (
                <p className="text-destructive text-sm">{connectError}</p>
              )}
              <Button type="submit" disabled={isPending}>
                {isPending ? "Connecting..." : "Connect GitHub Issues"}
              </Button>
            </form>
          )}

          {!integration && !isAdmin && (
            <p className="text-muted-foreground text-sm">
              Only admins can configure the GitHub Issues integration.
            </p>
          )}

          {integration && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Badge variant="default" className="bg-green-600">
                  Connected
                </Badge>
                <span className="text-muted-foreground text-sm">
                  {integration.defaultRepo}
                </span>
              </div>
              <div className="text-muted-foreground grid gap-1 text-sm">
                {integration.defaultProjectId && (
                  <p>
                    <span className="font-medium text-foreground">
                      Project ID:
                    </span>{" "}
                    {integration.defaultProjectId}
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
            Recent synchronization activity with GitHub Issues.
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
                  <TableHead>Issue #</TableHead>
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
                      {entry.githubIssueNumber != null
                        ? `#${entry.githubIssueNumber}`
                        : "--"}
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
