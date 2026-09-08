"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
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
  connectTeams,
  disconnectTeams,
  testTeamsConnection,
  addTeamsNotificationConfig,
  removeTeamsNotificationConfig,
} from "@/app/(dashboard)/settings/teams-actions"

export interface TeamsSettingsProps {
  integration: {
    id: string
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

export function TeamsSettings({
  integration,
  notifications,
  userRole,
}: TeamsSettingsProps) {
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
      const result = await connectTeams(formData)
      if (!result.success) {
        setConnectError(result.error ?? "Failed to connect.")
      }
    })
  }

  function handleDisconnect() {
    startTransition(async () => {
      await disconnectTeams()
      setTestResult(null)
    })
  }

  function handleTestConnection() {
    setTestResult(null)
    startTransition(async () => {
      const result = await testTeamsConnection()
      if (result.success) {
        setTestResult({
          success: true,
          message: "Connection successful. A test message was sent to your Teams channel.",
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
      const result = await addTeamsNotificationConfig(formData)
      if (result.success) {
        setDialogOpen(false)
      } else {
        setAddError(result.error ?? "Failed to add notification.")
      }
    })
  }

  function handleRemoveNotification(id: string) {
    startTransition(async () => {
      await removeTeamsNotificationConfig(id)
    })
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Teams availability</CardTitle>
          <CardDescription>Webhook connection testing is available. Bot commands and automatic event notifications are unavailable.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>Submitting a message in Teams does not create a VPO request. Create requests and check their progress in the web app. Saved notification preferences do not currently send events automatically.</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild><Link href="/requests/new">Create a request</Link></Button>
            <Button asChild variant="outline"><Link href="/requests">View requests</Link></Button>
          </div>
        </CardContent>
      </Card>
      {/* Connection Card */}
      <Card>
        <CardHeader>
          <CardTitle>Microsoft Teams Integration</CardTitle>
          <CardDescription>
            {integration
              ? "A channel webhook is saved. You can send a connection test below."
              : "Save a Teams channel webhook and send a connection test."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!integration && isAdmin && (
            <div className="space-y-4">
              <div className="text-muted-foreground space-y-2 text-sm">
                <p>Paste your channel’s incoming webhook URL below. Connecting sends a test message; it does not enable bot commands or automatic notifications.</p>
              </div>
              <form action={handleConnect} className="space-y-4">
                <div className="grid gap-1.5">
                  <label htmlFor="webhookUrl" className="text-sm font-medium">
                    Webhook URL
                  </label>
                  <Input
                    id="webhookUrl"
                    name="webhookUrl"
                    type="url"
                    placeholder="https://...webhook.office.com/..."
                    required
                    disabled={isPending}
                  />
                </div>
                {connectError && (
                  <p className="text-destructive text-sm">{connectError}</p>
                )}
                <div className="flex gap-2">
                  <Button type="submit" disabled={isPending}>
                    {isPending ? "Connecting..." : "Connect to Teams"}
                  </Button>
                </div>
              </form>
            </div>
          )}

          {!integration && !isAdmin && (
            <p className="text-muted-foreground text-sm">
              Only admins can configure the Teams integration.
            </p>
          )}

          {integration && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Badge variant="default" className="bg-green-600">
                  Connected
                </Badge>
                <span className="text-muted-foreground text-sm">
                  Connected: {formatDate(integration.connectedAt)}
                </span>
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

      {/* Notification Configuration Card */}
      {integration && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>Saved notification preferences</CardTitle>
                <CardDescription>
                  These preferences are stored for future notification support. Automatic delivery is unavailable.
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
                          htmlFor="notifChannelName"
                          className="text-sm font-medium"
                        >
                          Channel Name
                        </label>
                        <Input
                          id="notifChannelName"
                          name="channelName"
                          placeholder="#general"
                          required
                          disabled={isPending}
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <label
                          htmlFor="notifWebhookUrl"
                          className="text-sm font-medium"
                        >
                          Channel Webhook URL
                        </label>
                        <Input
                          id="notifWebhookUrl"
                          name="webhookUrl"
                          type="url"
                          placeholder="https://...webhook.office.com/..."
                          required
                          disabled={isPending}
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <label
                          htmlFor="notifEventType"
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
