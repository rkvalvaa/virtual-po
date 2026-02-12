"use client"

import { useState } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { toggleEmailPreference } from "@/app/(dashboard)/settings/email-actions"
import type { NotificationType } from "@/lib/types/database"

interface EmailPreferencesSettingsProps {
  preferences: Record<NotificationType, boolean>
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
    type: "REVIEW_NEEDED",
    label: "Review Requests",
    description: "When a request is ready for your review",
  },
]

export function EmailPreferencesSettings({
  preferences,
}: EmailPreferencesSettingsProps) {
  const [prefs, setPrefs] = useState(preferences)
  const [loading, setLoading] = useState<NotificationType | null>(null)

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

  return (
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
              className="flex items-center justify-between rounded-lg border p-4"
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
  )
}
