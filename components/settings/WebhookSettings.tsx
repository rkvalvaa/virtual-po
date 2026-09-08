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
  webhookDeliveryHistoryAction,
  redeliverWebhookAction,
  rotateWebhookSecretAction,
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
  { value: "security_review.completed", label: "Security Review Completed" },
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
  const [secret, setSecret] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [rotateId, setRotateId] = useState<string | null>(null)
  const [historyId, setHistoryId] = useState<string | null>(null)
  const [history, setHistory] = useState<Extract<Awaited<ReturnType<typeof webhookDeliveryHistoryAction>>, { success: true }>["deliveries"]>([])
  const [historyError, setHistoryError] = useState<string | null>(null)

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
        setSecret(result.secret ?? null)
        setCopied(false)
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
        setMessage({ type: "success", text: "Test delivered successfully (recipient returned HTTP 2xx)." })
      } else {
        setMessage({ type: "error", text: result.error ?? "Failed to send test." })
      }
    })
  }

  function loadHistory(id: string) {
    setHistoryId(id)
    setHistory([])
    setHistoryError(null)
    startTransition(async () => {
      try {
        const result = await webhookDeliveryHistoryAction(id)
        if (result.success) setHistory(result.deliveries)
        else setHistoryError(result.error)
      } catch { setHistoryError("Could not load deliveries. Try refreshing.") }
    })
  }

  function handleRotate() {
    if (!rotateId) return
    startTransition(async () => {
      try {
        const result = await rotateWebhookSecretAction(rotateId)
        if (result.success && result.secret) {
          setSecret(result.secret)
          setCopied(false)
          setRotateId(null)
        } else setMessage({ type: "error", text: result.error ?? "Could not rotate secret." })
      } catch { setMessage({ type: "error", text: "Could not rotate secret." }) }
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
          <p role="status" className={`text-sm ${message.type === "error" ? "text-red-600" : "text-green-600"}`}>
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
                        <Button variant="outline" size="sm" disabled={isPending} onClick={() => loadHistory(webhook.id)}>Deliveries</Button>
                        <Button variant="outline" size="sm" disabled={isPending} onClick={() => setRotateId(webhook.id)}>Rotate secret</Button>
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
      {isAdmin && <>
        <Dialog open={secret !== null} onOpenChange={(open) => { if (!open) { setSecret(null); setCopied(false) } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Save your signing secret</DialogTitle>
              <DialogDescription>This secret is shown once. Save it in your receiver’s secret store before closing. Future deliveries are signed with this secret.</DialogDescription>
            </DialogHeader>
            <Label htmlFor="webhook-secret">Signing secret</Label>
            <Input id="webhook-secret" readOnly value={secret ?? ""} className="font-mono" />
            <DialogFooter>
              <Button variant="outline" onClick={async () => {
                try { await navigator.clipboard.writeText(secret ?? ""); setCopied(true) }
                catch { setMessage({ type: "error", text: "Copy failed. Select and copy the signing secret manually." }) }
              }}>{copied ? "Copied" : "Copy secret"}</Button>
              <Button onClick={() => { setSecret(null); setCopied(false) }}>I saved the secret</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={rotateId !== null} onOpenChange={(open) => { if (!open) setRotateId(null) }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rotate signing secret?</DialogTitle>
              <DialogDescription>The old secret will stop signing new attempts immediately. Pause the webhook first if your receiver needs time to update. Save the new secret, update your receiver, then resume delivery. Requests already in flight may still use the old secret.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" disabled={isPending} onClick={() => setRotateId(null)}>Cancel</Button>
              <Button disabled={isPending} onClick={handleRotate}>{isPending ? "Rotating…" : "Rotate signing secret"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={historyId !== null} onOpenChange={(open) => { if (!open) setHistoryId(null) }}>
          <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Webhook deliveries</DialogTitle>
              <DialogDescription>Latest 30 deliveries. Transient failures retry up to five times. Paused webhooks wait until resumed. Delivery times depend on the configured worker schedule.</DialogDescription>
            </DialogHeader>
            {historyError && <p role="alert">{historyError}</p>}
            {isPending && <p role="status">Loading…</p>}
            {!isPending && !historyError && history.length === 0 && <p>No deliveries yet.</p>}
            <ul className="space-y-4">
              {history.map(delivery => <li key={delivery.id} className="space-y-2 border-b pb-4 text-sm">
                <p className="font-medium">{formatEvent(delivery.event)} · {delivery.status.toLowerCase()}</p>
                <p>{new Date(delivery.createdAt).toLocaleString()} · {delivery.attemptCount} attempts{delivery.httpStatus ? ` · HTTP ${delivery.httpStatus}` : ""}{delivery.errorCode ? ` · ${delivery.errorCode}` : ""}</p>
                <p className="break-all text-xs text-muted-foreground">Event ID: {delivery.eventId}</p>
                {delivery.status === "PENDING" && <p>Eligible for retry: {new Date(delivery.nextAttemptAt).toLocaleString()}</p>}
                {delivery.attempts.length > 0 && <details><summary>Attempt history</summary><ul>{delivery.attempts.map(attempt => <li key={attempt.attempt}>Attempt {attempt.attempt}: {attempt.outcome.toLowerCase()}{attempt.httpStatus ? ` · HTTP ${attempt.httpStatus}` : ""}{attempt.errorCode ? ` · ${attempt.errorCode}` : ""}</li>)}</ul></details>}
                {delivery.status === "FAILED" && <Button size="sm" variant="outline" disabled={isPending} onClick={() => startTransition(async () => {
                  try {
                    const result = await redeliverWebhookAction(delivery.id)
                    if (!result.success) setHistoryError(result.error ?? "Could not queue delivery.")
                    else if (historyId) loadHistory(historyId)
                  } catch { setHistoryError("Could not queue delivery. Try again.") }
                })}>Retry delivery</Button>}
              </li>)}
            </ul>
            <DialogFooter><Button disabled={isPending} onClick={() => { if (historyId) loadHistory(historyId) }}>Refresh</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </>}
    </Card>
  )
}
