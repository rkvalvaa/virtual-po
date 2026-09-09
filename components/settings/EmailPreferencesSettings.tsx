"use client"

import { useState, useTransition } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { retryEmailDeliveryAction, sendEmailTestAction, toggleEmailPreference } from "@/app/(dashboard)/settings/email-actions"
import type { NotificationType } from "@/lib/types/database"
import type { EmailReadiness } from "@/lib/email/config"
import type { EmailDeliverySummary, EmailDeliveryStatus } from "@/lib/email/outbox"

interface EmailPreferencesSettingsProps {
  preferences: Record<NotificationType, boolean>
  userRole: string
  readiness: EmailReadiness
  deliveries: EmailDeliverySummary[]
}

const NOTIFICATION_LABELS: { type: NotificationType; label: string; description: string }[] = [
  {
    type: "STATUS_CHANGED",
    label: "Status Changes",
    description: "When a request you submitted changes status",
  },
  {
    type: "DECISION_MADE",
    label: "Decisions",
    description: "When a decision is made on your request (approved, rejected, deferred)",
  },
  {
    type: "COMMENT_ADDED",
    label: "Comments",
    description: "When someone comments on your request",
  },
  {
    type: "VOTE_RECEIVED",
    label: "Votes",
    description: "When someone votes on your request",
  },
  {
    type: "ASSESSMENT_COMPLETE",
    label: "Assessments",
    description: "When an AI assessment completes on your request",
  },
  {
    type: "SECURITY_REVIEW_COMPLETE",
    label: "Security Reviews",
    description: "When a security review completes on your request",
  },
  {
    type: "REVIEW_NEEDED",
    label: "Review Requests",
    description: "When a request is ready for your review",
  },
  {
    type: "AI_BUDGET_WARNING",
    label: "AI Budget Warnings",
    description: "When estimated usage and held reservations cross your workspace warning threshold",
  },
]

export function EmailPreferencesSettings({
  preferences,
  userRole,
  readiness,
  deliveries: initialDeliveries,
}: EmailPreferencesSettingsProps) {
  const [prefs, setPrefs] = useState(preferences)
  const [loading, setLoading] = useState<NotificationType | null>(null)
  const [pending, startTransition] = useTransition()
  const [deliveries, setDeliveries] = useState(initialDeliveries)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState(false)

  async function handleToggle(type: NotificationType) {
    const newValue = !prefs[type]
    setLoading(type)
    setPrefs((prev) => ({ ...prev, [type]: newValue }))
    try {
      await toggleEmailPreference(type, newValue)
    } catch {
      // Revert on error
      setPrefs((prev) => ({ ...prev, [type]: !newValue }))
    } finally {
      setLoading(null)
    }
  }

  function sendTest() {
    setMessage(null)
    startTransition(async () => {
      const result = await sendEmailTestAction()
      setError(!result.success)
      setMessage(result.success
        ? 'Test email was accepted by the provider; inbox delivery is not confirmed.'
        : result.error ?? `Test email is ${result.status?.toLowerCase() ?? 'unavailable'}.`)
    })
  }

  function retry(deliveryId: string) {
    setMessage(null)
    startTransition(async () => {
      const result = await retryEmailDeliveryAction(deliveryId)
      setError(!result.success)
      setMessage(result.success ? 'Email queued for retry.' : result.error ?? 'Unable to retry email.')
      if (result.success) setDeliveries(current => current.map(item => item.id === deliveryId ? { ...item, status: 'QUEUED', errorCode: null, errorMessage: null } : item))
    })
  }

  return <div className="space-y-4">
    {userRole === 'ADMIN' && <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Delivery readiness</CardTitle>
            <CardDescription>Email tests are sent only to your signed-in administrator address.</CardDescription>
          </div>
          <Badge variant={readiness.state === 'CONFIGURED' ? 'default' : 'outline'}>
            {readiness.state === 'CONFIGURED' ? 'Configured' : 'Unavailable'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">{readiness.message}</p>
        {readiness.sender && <p className="break-all text-sm text-muted-foreground">Sender: {readiness.sender}</p>}
        {readiness.applicationUrl && <p className="break-all text-sm text-muted-foreground">Application URL: {readiness.applicationUrl}</p>}
        <Button onClick={sendTest} disabled={pending || readiness.state !== 'CONFIGURED'}>Send test to me</Button>
        {message && <p role="status" className={`text-sm ${error ? 'text-destructive' : 'text-muted-foreground'}`}>{message}</p>}
      </CardContent>
    </Card>}

    <Card>
      <CardHeader>
        <CardTitle>Email Notifications</CardTitle>
        <CardDescription>
          Choose which notifications you want to receive by email. In-app
          notifications are always enabled.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {NOTIFICATION_LABELS.map(({ type, label, description }) => (
            <div
              key={type}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
            >
              <div className="space-y-0.5">
                <p className="text-sm font-medium">{label}</p>
                <p className="text-muted-foreground text-xs">{description}</p>
              </div>
              <Switch
                checked={prefs[type]}
                onCheckedChange={() => handleToggle(type)}
                disabled={loading === type}
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>

    {userRole === 'ADMIN' && <Card>
      <CardHeader>
        <CardTitle>Recent deliveries</CardTitle>
        <CardDescription>Provider acceptance means the provider received the request. It does not confirm inbox delivery.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {deliveries.length === 0 && <p className="text-sm text-muted-foreground">No email delivery attempts yet.</p>}
        {deliveries.map(delivery => <div key={delivery.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-4">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={delivery.status === 'FAILED' ? 'destructive' : 'outline'}>{statusLabel(delivery.status)}</Badge>
              <span className="text-xs text-muted-foreground">{delivery.kind === 'TEST' ? 'Test' : 'Notification'} · {new Date(delivery.createdAt).toLocaleString()}</span>
            </div>
            <p className="break-all text-sm">{delivery.recipientEmail}</p>
            <p className="text-xs text-muted-foreground">Attempts: {delivery.attemptCount}</p>
            {delivery.status === 'ACCEPTED' && <p className="text-xs text-muted-foreground">Accepted by the provider; this does not confirm inbox delivery.</p>}
            {delivery.status === 'RECONCILIATION_REQUIRED' && <p className="text-xs text-destructive">The provider outcome is unknown and safe automatic retry has stopped. Reconcile this message in Resend before sending again.</p>}
            {delivery.errorMessage && <p className="text-xs text-destructive">{delivery.errorMessage}</p>}
          </div>
          {(delivery.status === 'FAILED' || delivery.status === 'UNAVAILABLE') && <Button variant="outline" size="sm" disabled={pending || readiness.state !== 'CONFIGURED'} onClick={() => retry(delivery.id)} aria-label="Retry failed email">Retry</Button>}
        </div>)}
      </CardContent>
    </Card>}
  </div>
}

function statusLabel(status: EmailDeliveryStatus): string {
  return ({
    UNAVAILABLE: 'Unavailable',
    QUEUED: 'Queued',
    PROCESSING: 'Processing',
    ACCEPTED: 'Accepted by provider',
    DELIVERED: 'Delivered to recipient mail server',
    FAILED: 'Failed',
    RECONCILIATION_REQUIRED: 'Reconciliation required',
  })[status]
}
