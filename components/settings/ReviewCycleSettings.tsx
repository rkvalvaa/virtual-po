"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
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
import {
  saveReviewCycleConfig,
  triggerReviewCycle,
} from "@/app/(dashboard)/settings/review-cycle-actions"

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
]

export interface ReviewCycleSettingsProps {
  config: {
    enabled: boolean
    cadence: "WEEKLY" | "MONTHLY"
    dayOfWeek: number
    dayOfMonth?: number
  }
  cycles: Array<{
    id: string
    startedAt: string
    requeuedCount: number
    triggeredBy: string
    decided: number
    total: number
  }>
  userRole: string
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export function ReviewCycleSettings({
  config,
  cycles,
  userRole,
}: ReviewCycleSettingsProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [enabled, setEnabled] = useState(config.enabled)
  const [cadence, setCadence] = useState(config.cadence)
  const [dayOfWeek, setDayOfWeek] = useState(String(config.dayOfWeek))
  const [dayOfMonth, setDayOfMonth] = useState(String(config.dayOfMonth ?? 1))

  const isAdmin = userRole === "ADMIN"

  function handleSave() {
    setError(null)
    setNotice(null)
    startTransition(async () => {
      const result = await saveReviewCycleConfig({
        enabled,
        cadence,
        dayOfWeek: Number(dayOfWeek),
        dayOfMonth: Number(dayOfMonth),
      })
      if (!result.success) {
        setError(result.error ?? "Failed to save.")
        return
      }
      setNotice("Saved.")
      router.refresh()
    })
  }

  function handleRunNow() {
    if (
      !window.confirm(
        "Move every deferred request back into review and notify reviewers?"
      )
    ) {
      return
    }
    setError(null)
    setNotice(null)
    startTransition(async () => {
      const result = await triggerReviewCycle()
      if (!result.success) {
        setError(result.error ?? "Failed to run the cycle.")
        return
      }
      setNotice(
        `Re-queued ${result.requeuedCount} deferred request${
          result.requeuedCount === 1 ? "" : "s"
        }.`
      )
      router.refresh()
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Review Cycles</CardTitle>
            <CardDescription>
              On a recurring cadence, deferred requests go back into the review
              queue and reviewers get a digest.
            </CardDescription>
          </div>
          {config.enabled && <Badge>Enabled</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {!isAdmin && (
          <p className="text-muted-foreground text-sm">
            Only admins can change review cycle settings.
          </p>
        )}

        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <p className="text-sm font-medium">Recurring cycles</p>
            <p className="text-muted-foreground text-xs">
              A scheduled job checks every morning (UTC) whether a cycle is due.
            </p>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={setEnabled}
            disabled={!isAdmin || isPending}
            aria-label="Recurring cycles enabled"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="rc-cadence" className="text-sm font-medium">
              Cadence
            </label>
            <select
              id="rc-cadence"
              className="border-input bg-background flex h-9 w-full rounded-md border px-3 py-1 text-sm"
              value={cadence}
              onChange={(e) =>
                setCadence(e.target.value === "MONTHLY" ? "MONTHLY" : "WEEKLY")
              }
              disabled={!isAdmin || isPending}
            >
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
            </select>
          </div>

          {cadence === "WEEKLY" ? (
            <div className="space-y-1">
              <label htmlFor="rc-day-of-week" className="text-sm font-medium">
                Day of week
              </label>
              <select
                id="rc-day-of-week"
                className="border-input bg-background flex h-9 w-full rounded-md border px-3 py-1 text-sm"
                value={dayOfWeek}
                onChange={(e) => setDayOfWeek(e.target.value)}
                disabled={!isAdmin || isPending}
              >
                {WEEKDAYS.map((day, index) => (
                  <option key={day} value={String(index)}>
                    {day}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="space-y-1">
              <label htmlFor="rc-day-of-month" className="text-sm font-medium">
                Day of month
              </label>
              <Input
                id="rc-day-of-month"
                type="number"
                min={1}
                max={28}
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(e.target.value)}
                disabled={!isAdmin || isPending}
              />
              <p className="text-muted-foreground text-xs">
                1&ndash;28, so the cycle never skips a short month.
              </p>
            </div>
          )}
        </div>

        {error && <p className="text-destructive text-sm">{error}</p>}
        {notice && <p className="text-muted-foreground text-sm">{notice}</p>}

        {isAdmin && (
          <div className="flex gap-2">
            <Button onClick={handleSave} disabled={isPending}>
              {isPending ? "Saving..." : "Save"}
            </Button>
            <Button variant="outline" onClick={handleRunNow} disabled={isPending}>
              Run cycle now
            </Button>
          </div>
        )}

        <Separator />

        <div className="space-y-3">
          <h4 className="text-sm font-semibold">Recent cycles</h4>
          {cycles.length === 0 ? (
            <p className="text-muted-foreground py-4 text-center text-sm">
              No cycles have run yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Started</TableHead>
                  <TableHead>Re-queued</TableHead>
                  <TableHead>Trigger</TableHead>
                  <TableHead>Progress</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cycles.map((cycle) => (
                  <TableRow key={cycle.id}>
                    <TableCell>{formatDateTime(cycle.startedAt)}</TableCell>
                    <TableCell>{cycle.requeuedCount}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{cycle.triggeredBy}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {cycle.total === 0
                        ? "—"
                        : `${cycle.decided} / ${cycle.total} decided`}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
