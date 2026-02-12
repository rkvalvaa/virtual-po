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
  connectLinear,
  disconnectLinear,
  testLinearConnection,
} from "@/app/(dashboard)/settings/linear-actions"

export interface LinearSettingsProps {
  integration: {
    id: string
    defaultTeamId: string | null
    isActive: boolean
    connectedAt: string
  } | null
  syncHistory: Array<{
    id: string
    entityType: string
    linearId: string
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

export function LinearSettings({
  integration,
  syncHistory,
  userRole,
}: LinearSettingsProps) {
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
      const result = await connectLinear(formData)
      if (!result.success) {
        setConnectError(result.error ?? "Failed to connect.")
      }
    })
  }

  function handleDisconnect() {
    startTransition(async () => {
      await disconnectLinear()
      setTestResult(null)
    })
  }

  function handleTestConnection() {
    setTestResult(null)
    startTransition(async () => {
      const result = await testLinearConnection()
      if (result.success) {
        const count = result.teams?.length ?? 0
        setTestResult({
          success: true,
          message: `Connection successful. Found ${count} team${count !== 1 ? "s" : ""}.`,
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
          <CardTitle>Linear Integration</CardTitle>
          <CardDescription>
            {integration
              ? "Your Linear workspace is connected. Sync epics and stories to Linear."
              : "Connect your Linear workspace to push epics and stories."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!integration && isAdmin && (
            <form action={handleConnect} className="space-y-4">
              <div className="grid gap-1.5">
                <label htmlFor="apiKey" className="text-sm font-medium">
                  API Key
                </label>
                <Input
                  id="apiKey"
                  name="apiKey"
                  type="password"
                  placeholder="Your Linear API key"
                  required
                  disabled={isPending}
                />
              </div>
              <div className="grid gap-1.5">
                <label htmlFor="defaultTeamId" className="text-sm font-medium">
                  Default Team ID
                </label>
                <Input
                  id="defaultTeamId"
                  name="defaultTeamId"
                  placeholder="Optional team ID"
                  disabled={isPending}
                />
              </div>
              {connectError && (
                <p className="text-destructive text-sm">{connectError}</p>
              )}
              <Button type="submit" disabled={isPending}>
                {isPending ? "Connecting..." : "Connect to Linear"}
              </Button>
            </form>
          )}

          {!integration && !isAdmin && (
            <p className="text-muted-foreground text-sm">
              Only admins can configure the Linear integration.
            </p>
          )}

          {integration && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Badge variant="default" className="bg-green-600">
                  Connected
                </Badge>
              </div>
              <div className="text-muted-foreground grid gap-1 text-sm">
                {integration.defaultTeamId && (
                  <p>
                    <span className="font-medium text-foreground">
                      Default Team:
                    </span>{" "}
                    {integration.defaultTeamId}
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
            Recent synchronization activity with Linear.
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
                  <TableHead>Linear ID</TableHead>
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
                      {entry.linearId || "--"}
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
