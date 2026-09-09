"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { updateTeamCapacity } from "@/app/(dashboard)/settings/okr-actions"
import { reconcileCapacityAction } from "@/app/(dashboard)/planning/actions"
import type { PlanningCapacity } from "@/lib/planning/types"

interface CapacitySettingsProps {
  capacity: PlanningCapacity
  currentQuarter: string
  userRole: string
}

export function CapacitySettings({ capacity, currentQuarter, userRole }: CapacitySettingsProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState("")
  const isAdmin = userRole === "ADMIN"

  function saveCapacity(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    formData.set("quarter", currentQuarter)
    startTransition(async () => {
      const result = await updateTeamCapacity(formData)
      setFeedback(result.error ?? "Capacity saved.")
      if (result.success) router.refresh()
    })
  }

  function reconcile(formData: FormData) {
    startTransition(async () => {
      const result = await reconcileCapacityAction(formData)
      setFeedback(result.error ?? "Capacity allocation reconciled.")
      if (result.success) router.refresh()
    })
  }

  return <Card>
    <CardHeader>
      <CardTitle>Team Capacity</CardTitle>
      <CardDescription>{currentQuarter}. Capacity and planned effort use days.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-6">
      {capacity.configured ? <div className="space-y-4">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-xs font-medium text-muted-foreground">Total capacity</dt><dd className="text-2xl font-bold">{capacity.totalCapacityDays}</dd><span className="text-xs text-muted-foreground">days</span></div>
          <div><dt className="text-xs font-medium text-muted-foreground">Legacy allocation</dt><dd className="text-2xl font-bold">{capacity.legacyAllocatedDays}</dd><span className="text-xs text-muted-foreground">days</span></div>
          <div><dt className="text-xs font-medium text-muted-foreground">Request-derived effort</dt><dd className="text-2xl font-bold">{capacity.requestDerivedDays}</dd><span className="text-xs text-muted-foreground">days</span></div>
          <div><dt className="text-xs font-medium text-muted-foreground">Unknown estimates</dt><dd className="text-2xl font-bold">{capacity.unknownRequestEstimates}</dd><span className="text-xs text-muted-foreground">requests</span></div>
        </dl>

        {!capacity.reconciliation ? <p role="status" className="rounded-md border border-amber-400/50 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
          Allocation is unreconciled. The legacy value may overlap request planning, so reliable total and remaining capacity are unavailable.
        </p> : <div className="space-y-2">
          <p className="text-sm text-muted-foreground">{capacity.reconciliation === "REPLACED_BY_REQUESTS"
            ? "Request planning replaces the legacy allocation."
            : "Legacy allocation is retained as work outside VPO."}</p>
          <dl className="grid gap-4 sm:grid-cols-3">
            <div><dt className="text-xs text-muted-foreground">Effective allocation</dt><dd className="font-semibold">{capacity.effectiveAllocatedDays} days</dd></div>
            <div><dt className="text-xs text-muted-foreground">Remaining capacity</dt><dd className="font-semibold">{capacity.remainingDays} days</dd></div>
            <div><dt className="text-xs text-muted-foreground">Over-allocation</dt><dd className={capacity.overAllocatedDays ? "font-semibold text-destructive" : "font-semibold"}>{capacity.overAllocatedDays} days</dd></div>
          </dl>
        </div>}

        {capacity.notes && <div><p className="text-xs font-medium text-muted-foreground">Notes</p><p className="text-sm">{capacity.notes}</p></div>}

        {isAdmin && <div className="space-y-2 rounded-md border p-4">
          <p className="text-sm font-medium">Reconcile allocation</p>
          <p className="text-xs text-muted-foreground">Choose how the preserved legacy allocation relates to effort entered on requests.</p>
          <div className="flex flex-wrap gap-2">
            <form action={reconcile}><input type="hidden" name="quarter" value={currentQuarter} /><input type="hidden" name="reconciliation" value="REPLACED_BY_REQUESTS" /><Button type="submit" size="sm" variant="outline" disabled={isPending}>Use request planning</Button></form>
            <form action={reconcile}><input type="hidden" name="quarter" value={currentQuarter} /><input type="hidden" name="reconciliation" value="RETAINED_AS_OUTSIDE_WORK" /><Button type="submit" size="sm" variant="outline" disabled={isPending}>Retain as outside work</Button></form>
          </div>
        </div>}
      </div> : <p className="py-4 text-center text-sm text-muted-foreground">No capacity data for {currentQuarter}. {isAdmin ? "Set it up below." : "An administrator can configure this."}</p>}

      {isAdmin && <form onSubmit={saveCapacity} className="space-y-4 rounded-md border p-4">
        <h4 className="text-sm font-semibold">{capacity.configured ? "Update Capacity" : "Set Capacity"}</h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><label htmlFor="cap-total" className="text-sm font-medium">Total Capacity (days)</label><Input id="cap-total" name="totalCapacityDays" type="number" min={0} max={100000} step="0.25" defaultValue={capacity.configured ? capacity.totalCapacityDays : ""} required disabled={isPending} /></div>
          <div className="space-y-1"><label htmlFor="cap-alloc" className="text-sm font-medium">Legacy Allocated (days)</label><Input id="cap-alloc" name="allocatedDays" type="number" min={0} max={100000} step="0.25" defaultValue={capacity.configured ? capacity.legacyAllocatedDays : ""} required disabled={isPending} /><p className="text-xs text-muted-foreground">Changing this value clears the prior reconciliation.</p></div>
        </div>
        <div className="space-y-1"><label htmlFor="cap-notes" className="text-sm font-medium">Notes</label><Textarea id="cap-notes" name="notes" defaultValue={capacity.notes ?? ""} disabled={isPending} /></div>
        <Button type="submit" disabled={isPending}>{isPending ? "Saving..." : "Save Capacity"}</Button>
      </form>}
      {feedback && <p role="status" className="text-sm">{feedback}</p>}
    </CardContent>
  </Card>
}
