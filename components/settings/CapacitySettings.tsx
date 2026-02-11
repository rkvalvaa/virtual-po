"use client"

import { useTransition } from "react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Progress } from "@/components/ui/progress"
import { updateTeamCapacity } from "@/app/(dashboard)/settings/okr-actions"

interface CapacitySettingsProps {
  capacity: {
    quarter: string
    totalCapacityDays: number
    allocatedDays: number
    notes: string | null
  } | null
  currentQuarter: string
  userRole: string
}

function getUtilizationColor(pct: number): string {
  if (pct >= 90) return "bg-red-500"
  if (pct >= 70) return "bg-yellow-500"
  return "bg-green-500"
}

export function CapacitySettings({
  capacity,
  currentQuarter,
  userRole,
}: CapacitySettingsProps) {
  const [isPending, startTransition] = useTransition()
  const isAdmin = userRole === "ADMIN"

  const total = capacity?.totalCapacityDays ?? 0
  const allocated = capacity?.allocatedDays ?? 0
  const available = total - allocated
  const utilizationPct = total > 0 ? Math.min(100, Math.round((allocated / total) * 100)) : 0

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    formData.set("quarter", currentQuarter)
    startTransition(async () => {
      await updateTeamCapacity(formData)
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Team Capacity</CardTitle>
        <CardDescription>
          Current quarter: {currentQuarter}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {capacity ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1">
                <p className="text-muted-foreground text-xs font-medium">
                  Total Capacity
                </p>
                <p className="text-2xl font-bold">{total}</p>
                <p className="text-muted-foreground text-xs">days</p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground text-xs font-medium">
                  Allocated
                </p>
                <p className="text-2xl font-bold">{allocated}</p>
                <p className="text-muted-foreground text-xs">days</p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground text-xs font-medium">
                  Available
                </p>
                <p className="text-2xl font-bold">{available}</p>
                <p className="text-muted-foreground text-xs">days</p>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Utilization</span>
                <span className="font-medium">{utilizationPct}%</span>
              </div>
              <div className="relative">
                <Progress value={utilizationPct} className="h-2.5" />
                <div
                  className={`absolute inset-0 h-2.5 rounded-full ${getUtilizationColor(utilizationPct)} opacity-80 transition-all`}
                  style={{ width: `${utilizationPct}%` }}
                />
              </div>
              <p className="text-muted-foreground text-xs">
                {utilizationPct < 70 && "Healthy capacity available"}
                {utilizationPct >= 70 && utilizationPct < 90 && "Capacity is getting tight"}
                {utilizationPct >= 90 && "Near or at full capacity"}
              </p>
            </div>

            {capacity.notes && (
              <div className="space-y-1">
                <p className="text-muted-foreground text-xs font-medium">
                  Notes
                </p>
                <p className="text-sm">{capacity.notes}</p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground py-4 text-center text-sm">
            No capacity data for {currentQuarter}.
            {isAdmin ? " Set it up below." : " An admin can configure this."}
          </p>
        )}

        {isAdmin && (
          <form onSubmit={handleSubmit} className="space-y-4 rounded-md border p-4">
            <h4 className="text-sm font-semibold">
              {capacity ? "Update Capacity" : "Set Capacity"}
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="cap-total" className="text-sm font-medium">
                  Total Capacity (days)
                </label>
                <Input
                  id="cap-total"
                  name="totalCapacityDays"
                  type="number"
                  min={0}
                  defaultValue={capacity?.totalCapacityDays ?? ""}
                  placeholder="e.g. 120"
                  required
                  disabled={isPending}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="cap-alloc" className="text-sm font-medium">
                  Allocated (days)
                </label>
                <Input
                  id="cap-alloc"
                  name="allocatedDays"
                  type="number"
                  min={0}
                  defaultValue={capacity?.allocatedDays ?? ""}
                  placeholder="e.g. 80"
                  required
                  disabled={isPending}
                />
              </div>
            </div>
            <div className="space-y-1">
              <label htmlFor="cap-notes" className="text-sm font-medium">
                Notes
              </label>
              <Textarea
                id="cap-notes"
                name="notes"
                defaultValue={capacity?.notes ?? ""}
                placeholder="Optional notes about capacity..."
                disabled={isPending}
              />
            </div>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Save Capacity"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
