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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  connectSlack,
  disconnectSlack,
  testSlackConnection,
  addNotificationConfig,
  removeNotificationConfig,
} from "@/app/(dashboard)/settings/slack-actions"

export interface SlackSettingsProps {
  integration: {
    id: string
    appId: string
    isActive: boolean
    connectedAt: string
  } | null
  notifications: Array<{
    id: string
    channelName: string
    eventType: string
    isActive: boolean
  }>
  userRole: string
}

const EVENT_TYPES = [
  { value: "REQUEST_CREATED", label: "Request Created" },
  { value: "STATUS_CHANGED", label: "Status Changed" },
  { value: "DECISION_MADE", label: "Decision Made" },
  { value: "ASSESSMENT_COMPLETE", label: "Assessment Complete" },
  { value: "REVIEW_NEEDED", label: "Review Needed" },
] as const

function formatEventType(eventType: string): string {
  const found = EVENT_TYPES.find((et) => et.value === eventType)
  if (found) return found.label
  return eventType
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ")
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

const WEBHOOK_URLS = [
  { label: "Events URL", path: "/api/slack/events" },
  { label: "Slash Commands URL", path: "/api/slack/commands" },
  { label: "Interactivity URL", path: "/api/slack/interactions" },
]

export function SlackSettings({
  integration,
  notifications,
  userRole,
}: SlackSettingsProps) {
  const [isPending, startTransition] = useTransition()
  const [testResult, setTestResult] = useState<{
    success: boolean
    message: string
  } | null>(null)
  const [connectError, setConnectError] = useState<string | null>(null)
  const [addError, setAddError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const isAdmin = userRole === "ADMIN"
  const canManageNotifications = userRole === "ADMIN" || userRole === "REVIEWER"

  function handleConnect(formData: FormData) {
    setConnectError(null)
    startTransition(async () => {
      const result = await connectSlack(formData)
      if (!result.success) {
        setConnectError(result.error ?? "Failed to connect.")
      }
    })
  }

  function handleDisconnect() {
    startTransition(async () => {
      await disconnectSlack()
      setTestResult(null)
    })
  }

  function handleTestConnection() {
    setTestResult(null)
    startTransition(async () => {
      const result = await testSlackConnection()
      if (result.success) {
        const count = result.channels?.length ?? 0
        setTestResult({
          success: true,
          message: `Connection successful. Found ${count} channel${count !== 1 ? "s" : ""}.`,
        })
      } else {
        setTestResult({
          success: false,
          message: result.error ?? "Connection failed.",
        })
      }
    })
  }

  function handleAddNotification(formData: FormData) {
    setAddError(null)
    startTransition(async () => {
      const result = await addNotificationConfig(formData)
      if (result.success) {
        setDialogOpen(false)
      } else {
        setAddError(result.error ?? "Failed to add notification.")
      }
    })
  }

  function handleRemoveNotification(id: string) {
    startTransition(async () => {
      await removeNotificationConfig(id)
    })
  }

  return (
    <div className="space-y-6">
      {/* Connection Card */}
      <Card>
        <CardHeader>
          <CardTitle>Slack Integration</CardTitle>
          <CardDescription>
            {integration
              ? "Your Slack workspace is connected. Configure notifications and slash commands."
              : "Connect your Slack workspace to receive notifications and use slash commands."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!integration && isAdmin && (
            <div className="space-y-4">
              <div className="text-muted-foreground space-y-2 text-sm">
                <p>To set up the Slack integration:</p>
                <ol className="list-inside list-decimal space-y-1">
                  <li>
                    Create a Slack app at{" "}
                    <code className="bg-muted rounded px-1 py-0.5 text-xs">
                      api.slack.com/apps
                    </code>
                  </li>
                  <li>
                    Add bot scopes:{" "}
                    <code className="bg-muted rounded px-1 py-0.5 text-xs">
                      chat:write
                    </code>
                    ,{" "}
                    <code className="bg-muted rounded px-1 py-0.5 text-xs">
                      channels:read
                    </code>
                    ,{" "}
                    <code className="bg-muted rounded px-1 py-0.5 text-xs">
                      commands
                    </code>
                  </li>
                  <li>Install the app to your workspace</li>
                  <li>Copy the Bot Token, Signing Secret, and App ID below</li>
                </ol>
              </div>
              <form action={handleConnect} className="space-y-4">
                <div className="grid gap-1.5">
                  <label htmlFor="botToken" className="text-sm font-medium">
                    Bot Token
                  </label>
                  <Input
                    id="botToken"
                    name="botToken"
                    type="password"
                    placeholder="xoxb-..."
                    required
                    disabled={isPending}
                  />
                </div>
                <div className="grid gap-1.5">
                  <label
                    htmlFor="signingSecret"
                    className="text-sm font-medium"
                  >
                    Signing Secret
                  </label>
                  <Input
                    id="signingSecret"
                    name="signingSecret"
                    type="password"
                    placeholder="Your Slack signing secret"
                    required
                    disabled={isPending}
                  />
                </div>
                <div className="grid gap-1.5">
                  <label htmlFor="appId" className="text-sm font-medium">
                    App ID
                  </label>
                  <Input
                    id="appId"
                    name="appId"
                    placeholder="A0123456789"
                    required
                    disabled={isPending}
                  />
                </div>
                {connectError && (
                  <p className="text-destructive text-sm">{connectError}</p>
                )}
                <div className="flex gap-2">
                  <Button type="submit" disabled={isPending}>
                    {isPending ? "Connecting..." : "Connect to Slack"}
                  </Button>
                </div>
              </form>
            </div>
          )}

          {!integration && !isAdmin && (
            <p className="text-muted-foreground text-sm">
              Only admins can configure the Slack integration.
            </p>
          )}

          {integration && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Badge variant="default" className="bg-green-600">
                  Connected
                </Badge>
                <span className="text-muted-foreground text-sm">
                  App ID: {integration.appId}
                </span>
              </div>
              <div className="text-muted-foreground grid gap-1 text-sm">
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

      {/* Webhook URLs Card */}
      {integration && (
        <Card>
          <CardHeader>
            <CardTitle>Webhook URLs</CardTitle>
            <CardDescription>
              Configure these URLs in your Slack app settings.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {WEBHOOK_URLS.map((webhook) => (
              <div key={webhook.path} className="grid gap-1">
                <p className="text-sm font-medium">{webhook.label}</p>
                <code className="bg-muted text-muted-foreground rounded px-3 py-2 text-sm">
                  {webhook.path}
                </code>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Notification Configuration Card */}
      {integration && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Notification Configuration</CardTitle>
                <CardDescription>
                  Configure which events send notifications to Slack channels.
                </CardDescription>
              </div>
              {canManageNotifications && (
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm">Add Notification</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Notification</DialogTitle>
                    </DialogHeader>
                    <form
                      action={handleAddNotification}
                      className="space-y-4"
                    >
                      <div className="grid gap-1.5">
                        <label
                          htmlFor="channelName"
                          className="text-sm font-medium"
                        >
                          Channel Name
                        </label>
                        <Input
                          id="channelName"
                          name="channelName"
                          placeholder="#general"
                          required
                          disabled={isPending}
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <label
                          htmlFor="channelId"
                          className="text-sm font-medium"
                        >
                          Channel ID
                        </label>
                        <Input
                          id="channelId"
                          name="channelId"
                          placeholder="C0123456789"
                          required
                          disabled={isPending}
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <label
                          htmlFor="eventType"
                          className="text-sm font-medium"
                        >
                          Event Type
                        </label>
                        <Select name="eventType" required>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select an event type" />
                          </SelectTrigger>
                          <SelectContent>
                            {EVENT_TYPES.map((et) => (
                              <SelectItem key={et.value} value={et.value}>
                                {et.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {addError && (
                        <p className="text-destructive text-sm">{addError}</p>
                      )}
                      <Button type="submit" disabled={isPending}>
                        {isPending ? "Adding..." : "Add Notification"}
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {notifications.length === 0 ? (
              <div className="text-muted-foreground px-6 py-8 text-center text-sm">
                No notification configurations.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Channel</TableHead>
                    <TableHead>Event Type</TableHead>
                    <TableHead>Status</TableHead>
                    {canManageNotifications && (
                      <TableHead className="w-[80px]" />
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {notifications.map((notification) => (
                    <TableRow key={notification.id}>
                      <TableCell className="text-sm font-medium">
                        {notification.channelName}
                      </TableCell>
                      <TableCell className="text-sm">
                        {formatEventType(notification.eventType)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            notification.isActive ? "default" : "secondary"
                          }
                          className={
                            notification.isActive ? "bg-green-600" : ""
                          }
                        >
                          {notification.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      {canManageNotifications && (
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isPending}
                            onClick={() =>
                              handleRemoveNotification(notification.id)
                            }
                            className="text-destructive"
                          >
                            Delete
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
