"use client"

import { useCallback, useEffect, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  getLinearStatusSyncOverview,
  loadLinearStatusWorkflowStates,
  reconcileLinearStatusSync,
  resolveLinearStatusSyncConflict,
  saveLinearStatusSync,
} from "@/app/(dashboard)/settings/linear-actions"
import { REQUEST_STATUSES, type RequestStatus } from "@/lib/types/database"

interface Overview {
  config: null | {
    enabled: boolean
    mappings: Array<{ remoteStatusId: string; remoteStatusName: string; targetStatus: RequestStatus }>
    checkpointAt: string | null
    lastSyncAt: string | null
    lastReconciledAt?: string | null
    lastError: string | null
    failureCount: number
  }
  conflicts: Array<{
    id: string
    requestId: string
    requestTitle: string
    remoteStatusName: string
    mappedStatus: RequestStatus
    localStatus: RequestStatus
    reason: string
  }>
}

const displayStatus = (status: string) => status.replaceAll("_", " ")

export function LinearStatusSyncSettings({ teamId, isAdmin }: { teamId: string; isAdmin: boolean }) {
  const [destination, setDestination] = useState(teamId)
  const [overview, setOverview] = useState<Overview | null>(null)
  const [states, setStates] = useState<Array<{ id: string; name: string; type: string }>>([])
  const [targets, setTargets] = useState<Record<string, RequestStatus | "">>({})
  const [enabled, setEnabled] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const refresh = useCallback(async () => {
    if (!destination.trim()) return
    const result = await getLinearStatusSyncOverview(destination)
    if (!result.success) {
      setError(result.error)
      return
    }
    const next = result.overview as Overview
    setOverview(next)
    setEnabled(next.config?.enabled ?? false)
    setTargets(Object.fromEntries((next.config?.mappings ?? []).map(mapping => [mapping.remoteStatusId, mapping.targetStatus])))
  }, [destination])

  useEffect(() => {
    let active = true
    if (!destination.trim()) return
    void getLinearStatusSyncOverview(destination).then(result => {
      if (!active) return
      if (!result.success) {
        setError(result.error)
        return
      }
      const next = result.overview as Overview
      setOverview(next)
      setEnabled(next.config?.enabled ?? false)
      setTargets(Object.fromEntries((next.config?.mappings ?? []).map(mapping => [mapping.remoteStatusId, mapping.targetStatus])))
    })
    return () => { active = false }
  }, [destination])

  function loadStates() {
    setError(null)
    startTransition(async () => {
      const result = await loadLinearStatusWorkflowStates(destination)
      if (!result.success) return setError(result.error)
      setStates(result.states)
    })
  }

  function save() {
    setError(null)
    setNotice(null)
    startTransition(async () => {
      const mappings = states.flatMap(state => targets[state.id]
        ? [{ remoteStatusId: state.id, remoteStatusName: state.name, targetStatus: targets[state.id] as RequestStatus }]
        : [])
      const result = await saveLinearStatusSync({ destination, enabled, mappings })
      if (!result.success) return setError(result.error)
      setNotice("Linear status mapping saved.")
      await refresh()
    })
  }

  function reconcile() {
    setError(null)
    setNotice(null)
    startTransition(async () => {
      const result = await reconcileLinearStatusSync(destination)
      if (!result.success) return setError(result.error)
      setNotice(`Reconciled ${result.result.observed} linked issue${result.result.observed === 1 ? "" : "s"}; applied ${result.result.applied}, conflicts ${result.result.conflicts}, failed ${result.result.failed}.`)
      await refresh()
    })
  }

  function resolve(conflictId: string, resolution: "KEEP_LOCAL" | "APPLY_REMOTE") {
    setError(null)
    startTransition(async () => {
      const result = await resolveLinearStatusSyncConflict(destination, conflictId, resolution)
      if (!result.success) return setError(result.error)
      await refresh()
    })
  }

  const configuredMappings = overview?.config?.mappings ?? []
  return (
    <Card>
      <CardHeader>
        <CardTitle>Inbound status sync</CardTitle>
        <CardDescription>
          Pull mapped Linear statuses into linked requests. VPO lifecycle and approval rules still apply; changes are never pushed back to Linear.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {isAdmin && <label className="grid max-w-md gap-1 text-sm font-medium">
          Linear team ID
          <Input value={destination} onChange={event => { setDestination(event.target.value); setOverview(null); setStates([]) }} placeholder="Stable Linear team ID" />
        </label>}
        {!overview && !error && <p className="text-sm text-muted-foreground">Loading status sync settings…</p>}
        {overview?.config && <div className="space-y-1 text-sm">
          <div className="flex items-center gap-2"><Badge variant={overview.config.enabled ? "default" : "secondary"}>{overview.config.enabled ? "Enabled" : "Disabled"}</Badge></div>
          <p><span className="font-medium">Last sync:</span> {overview.config.lastSyncAt ? new Date(overview.config.lastSyncAt).toLocaleString() : "Not yet synced"}</p>
          <p><span className="font-medium">Checkpoint:</span> {overview.config.checkpointAt ? new Date(overview.config.checkpointAt).toLocaleString() : "Not established"}</p>
          <p><span className="font-medium">Last reconciliation:</span> {overview.config.lastReconciledAt ? new Date(overview.config.lastReconciledAt).toLocaleString() : "Not yet reconciled"}</p>
          {overview.config.lastError && <div className="rounded-md border border-destructive/40 p-3 text-destructive" role="alert">
            <p>{overview.config.lastError}</p>
            <p>{overview.config.failureCount} failed attempt{overview.config.failureCount === 1 ? "" : "s"}; retry delay is bounded.</p>
          </div>}
        </div>}

        {configuredMappings.length > 0 && <div className="space-y-2">
          <p className="text-sm font-medium">Configured mappings</p>
          <ul className="space-y-1 text-sm">{configuredMappings.map(mapping => <li key={mapping.remoteStatusId} className="flex items-center gap-2">
            <span>{mapping.remoteStatusName}</span><span aria-hidden>→</span><Badge variant="outline">{displayStatus(mapping.targetStatus)}</Badge>
          </li>)}</ul>
        </div>}

        {isAdmin && <div className="space-y-3 border-t pt-4">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={isPending || !destination.trim()} onClick={loadStates}>Load Linear statuses</Button>
            <Button type="button" variant="outline" disabled={isPending || !overview?.config} onClick={reconcile}>Reconcile linked issues</Button>
          </div>
          {states.length > 0 && <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} /> Enable scheduled polling
            </label>
            <div className="space-y-2">{states.map(state => <label key={state.id} className="grid gap-1 text-sm sm:grid-cols-2 sm:items-center">
              <span>{state.name}</span>
              <select className="h-9 rounded-md border bg-background px-2" aria-label={`Map ${state.name}`} value={targets[state.id] ?? ""} onChange={event => setTargets(current => ({ ...current, [state.id]: event.target.value as RequestStatus | "" }))}>
                <option value="">Do not sync</option>
                {REQUEST_STATUSES.map(status => <option key={status} value={status}>{displayStatus(status)}</option>)}
              </select>
            </label>)}</div>
            <Button type="button" disabled={isPending} onClick={save}>Save status mapping</Button>
          </div>}
        </div>}

        {(overview?.conflicts.length ?? 0) > 0 && <div className="space-y-3 border-t pt-4">
          <p className="font-medium">Conflicts requiring review</p>
          {overview!.conflicts.map(conflict => <div key={conflict.id} className="space-y-2 rounded-md border border-amber-500/40 p-3 text-sm">
            <a href={`/requests/${conflict.requestId}`} className="font-medium underline-offset-4 hover:underline">{conflict.requestTitle}</a>
            <p>{displayStatus(conflict.localStatus)} → {displayStatus(conflict.mappedStatus)} from Linear “{conflict.remoteStatusName}”</p>
            <p className="text-muted-foreground">{conflict.reason}</p>
            {isAdmin && <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={isPending} onClick={() => resolve(conflict.id, "KEEP_LOCAL")} aria-label={`Keep local status for ${conflict.requestTitle}`}>Keep local</Button>
              <Button size="sm" disabled={isPending} onClick={() => resolve(conflict.id, "APPLY_REMOTE")} aria-label={`Apply Linear status for ${conflict.requestTitle}`}>Apply if allowed</Button>
            </div>}
          </div>)}
        </div>}
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        {notice && <p className="text-sm text-green-600" role="status">{notice}</p>}
      </CardContent>
    </Card>
  )
}
