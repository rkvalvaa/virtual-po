"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  createWebhookAction,
  updateWebhookAction,
  deleteWebhookAction,
  testWebhookAction,
} from "@/app/(dashboard)/settings/api-actions"

export interface WebhookSettingsProps {
  webhooks: Array<{
    id: string
    url: string
    events: string[]
    isActive: boolean
    lastTriggeredAt: string | null
    failureCount: number
    createdAt: string
  }>
  userRole: string
}

const WEBHOOK_EVENT_OPTIONS = [
  { value: "request.created", label: "Request Created" },
  { value: "request.updated", label: "Request Updated" },
  { value: "request.status_changed", label: "Status Changed" },
  { value: "assessment.completed", label: "Assessment Completed" },
  { value: "decision.made", label: "Decision Made" },
  { value: "epic.created", label: "Epic Created" },
  { value: "story.created", label: "Story Created" },
] as const

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function formatEvent(event: string): string {
  return event
    .split(".")
    .map((part) =>
      part
        .split("_")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ")
    )
    .join(": ")
}

function truncateUrl(url: string, maxLen = 40): string {
  if (url.length <= maxLen) return url
  return url.substring(0, maxLen) + "..."
}

function getStatusBadge(webhook: WebhookSettingsProps["webhooks"][number]) {
  if (!webhook.isActive) {
    return <Badge variant="outline" className="text-xs">Paused</Badge>
  }
  if (webhook.failureCount >= 5) {
    return <Badge variant="destructive" className="text-xs">Failing</Badge>
  }
  return <Badge variant="default" className="text-xs">Active</Badge>
}

export function WebhookSettings({ webhooks, userRole }: WebhookSettingsProps) {
  const [isPending, startTransition] = useTransition()
  const [createOpen, setCreateOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [url, setUrl] = useState("")
  const [selectedEvents, setSelectedEvents] = useState<string[]>([])
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const isAdmin = userRole === "ADMIN"

  function handleEventToggle(event: string, checked: boolean) {
    setSelectedEvents((prev) =>
      checked ? [...prev, event] : prev.filter((e) => e !== event)
    )
  }

  function handleCreate() {
    if (!url.trim() || selectedEvents.length === 0) return
    startTransition(async () => {
      const result = await createWebhookAction(url.trim(), selectedEvents)
      if (result.success) {
        setMessage({ type: "success", text: "Webhook created." })
        setCreateOpen(false)
        setUrl("")
        setSelectedEvents([])
      } else {
        setMessage({ type: "error", text: result.error ?? "Failed to create." })
      }
    })
  }

  function handleEditOpen(webhook: WebhookSettingsProps["webhooks"][number]) {
    setEditId(webhook.id)
    setUrl(webhook.url)
    setSelectedEvents([...webhook.events])
  }

  function handleEditSave() {
    if (!editId || !url.trim() || selectedEvents.length === 0) return
    startTransition(async () => {
      const result = await updateWebhookAction(editId, {
        url: url.trim(),
        events: selectedEvents,
      })
      if (result.success) {
        setMessage({ type: "success", text: "Webhook updated." })
        setEditId(null)
        setUrl("")
        setSelectedEvents([])
      } else {
        setMessage({ type: "error", text: result.error ?? "Failed to update." })
      }
    })
  }

  function handleToggleActive(id: string, currentlyActive: boolean) {
    startTransition(async () => {
      const result = await updateWebhookAction(id, { isActive: !currentlyActive })
      if (result.success) {
        setMessage({ type: "success", text: currentlyActive ? "Webhook paused." : "Webhook activated." })
      } else {
        setMessage({ type: "error", text: result.error ?? "Failed to update." })
      }
    })
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deleteWebhookAction(id)
      if (result.success) {
        setMessage({ type: "success", text: "Webhook deleted." })
      } else {
        setMessage({ type: "error", text: result.error ?? "Failed to delete." })
      }
    })
  }

  function handleTest(id: string) {
    startTransition(async () => {
      const result = await testWebhookAction(id)
      if (result.success) {
        setMessage({ type: "success", text: "Test event sent." })
      } else {
        setMessage({ type: "error", text: result.error ?? "Failed to send test." })
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Webhooks</CardTitle>
            <CardDescription>
              Receive HTTP callbacks when events occur in your organization.
            </CardDescription>
          </div>
          {isAdmin && (
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button>Add Webhook</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Webhook</DialogTitle>
                  <DialogDescription>
                    Enter a URL and select which events should trigger delivery.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="webhook-url">Payload URL</Label>
                    <Input
                      id="webhook-url"
                      placeholder="https://example.com/webhooks"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Events</Label>
                    <div className="grid gap-2">
                      {WEBHOOK_EVENT_OPTIONS.map((opt) => (
                        <div key={opt.value} className="flex items-center gap-2">
                          <Checkbox
                            id={`create-event-${opt.value}`}
                            checked={selectedEvents.includes(opt.value)}
                            onCheckedChange={(checked) =>
                              handleEventToggle(opt.value, !!checked)
                            }
                          />
                          <Label htmlFor={`create-event-${opt.value}`} className="font-normal">
                            {opt.label}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    onClick={handleCreate}
                    disabled={isPending || !url.trim() || selectedEvents.length === 0}
                  >
                    {isPending ? "Creating..." : "Create Webhook"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </CardHeader>

      {message && (
        <div className="px-6 pb-2">
          <p className={`text-sm ${message.type === "error" ? "text-red-600" : "text-green-600"}`}>
            {message.text}
          </p>
        </div>
      )}

      <CardContent className="p-0">
        {webhooks.length === 0 ? (
          <div className="text-muted-foreground px-6 py-8 text-center text-sm">
            No webhooks configured. Add one to receive event notifications.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>URL</TableHead>
                <TableHead>Events</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Triggered</TableHead>
                {isAdmin && <TableHead>Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {webhooks.map((webhook) => (
                <TableRow key={webhook.id}>
                  <TableCell className="font-mono text-sm" title={webhook.url}>
                    {truncateUrl(webhook.url)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {webhook.events.map((e) => (
                        <Badge key={e} variant="secondary" className="text-xs">
                          {formatEvent(e)}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>{getStatusBadge(webhook)}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {webhook.lastTriggeredAt ? formatDate(webhook.lastTriggeredAt) : "Never"}
                  </TableCell>
                  {isAdmin && (
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isPending}
                          onClick={() => handleTest(webhook.id)}
                        >
                          Test
                        </Button>
                        <Dialog
                          open={editId === webhook.id}
                          onOpenChange={(open) => {
                            if (!open) {
                              setEditId(null)
                              setUrl("")
                              setSelectedEvents([])
                            }
                          }}
                        >
                          <DialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEditOpen(webhook)}
                            >
                              Edit
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Edit Webhook</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4">
                              <div className="space-y-2">
                                <Label htmlFor="edit-url">Payload URL</Label>
                                <Input
                                  id="edit-url"
                                  value={url}
                                  onChange={(e) => setUrl(e.target.value)}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Events</Label>
                                <div className="grid gap-2">
                                  {WEBHOOK_EVENT_OPTIONS.map((opt) => (
                                    <div key={opt.value} className="flex items-center gap-2">
                                      <Checkbox
                                        id={`edit-event-${opt.value}`}
                                        checked={selectedEvents.includes(opt.value)}
                                        onCheckedChange={(checked) =>
                                          handleEventToggle(opt.value, !!checked)
                                        }
                                      />
                                      <Label htmlFor={`edit-event-${opt.value}`} className="font-normal">
                                        {opt.label}
                                      </Label>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                            <DialogFooter>
                              <Button
                                onClick={handleEditSave}
                                disabled={isPending || !url.trim() || selectedEvents.length === 0}
                              >
                                {isPending ? "Saving..." : "Save"}
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isPending}
                          onClick={() => handleToggleActive(webhook.id, webhook.isActive)}
                        >
                          {webhook.isActive ? "Pause" : "Resume"}
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={isPending}
                          onClick={() => handleDelete(webhook.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
