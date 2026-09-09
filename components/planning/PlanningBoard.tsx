"use client"

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { reconcileCapacityAction, updatePlanningRequestAction } from '@/app/(dashboard)/planning/actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { PlanningCapacity, PlanningCommitment } from '@/lib/planning/types'

interface PlanningRow {
  id: string
  title: string
  status: string
  assigneeId: string | null
  assigneeName: string | null
  commitment: PlanningCommitment | null
  targetPeriod: string | null
  manualRank: number | null
  objectiveId: string | null
  objectiveTitle: string | null
  plannedEffortDays: number | null
  priorityScore: number | null
  storyPointsTotal: number
  unknownStoryPointsCount: number
  planningVersion: number
  updatedAt: string
}

interface Props {
  requests: PlanningRow[]
  members: { id: string; name: string | null; email: string }[]
  objectives: { id: string; title: string }[]
  capacity: PlanningCapacity
  canEdit: boolean
  isAdmin: boolean
}

const GROUPS: { value: PlanningCommitment | null; title: string; description: string }[] = [
  { value: 'NOW', title: 'Now', description: 'Work the team intends to focus on now.' },
  { value: 'NEXT', title: 'Next', description: 'Work intended to follow current commitments.' },
  { value: 'LATER', title: 'Later', description: 'Work kept visible for later planning.' },
  { value: null, title: 'Uncommitted', description: 'Requests without a manual commitment.' },
]

function CapacitySummary({ capacity, isAdmin }: { capacity: PlanningCapacity; isAdmin: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState('')

  function reconcile(formData: FormData) {
    startTransition(async () => {
      const result = await reconcileCapacityAction(formData)
      setFeedback(result.error ?? 'Capacity allocation reconciled.')
      if (result.success) router.refresh()
    })
  }

  return <Card>
    <CardHeader>
      <CardTitle>Capacity for {capacity.quarter}</CardTitle>
      <CardDescription>Capacity and planned effort use days. Story points remain a separate estimate.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      {!capacity.configured && <p className="text-sm text-muted-foreground">
        Capacity is not configured for this quarter. <Link className="underline" href="/settings#capacity">Open capacity settings</Link>.
      </p>}
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div><dt className="text-xs text-muted-foreground">Total capacity</dt><dd className="text-xl font-semibold">{capacity.totalCapacityDays} days</dd></div>
        <div><dt className="text-xs text-muted-foreground">Legacy allocation</dt><dd className="text-xl font-semibold">{capacity.legacyAllocatedDays} days</dd></div>
        <div><dt className="text-xs text-muted-foreground">Request-derived effort</dt><dd className="text-xl font-semibold">{capacity.requestDerivedDays} days</dd></div>
        <div><dt className="text-xs text-muted-foreground">Unknown effort estimates</dt><dd className="text-xl font-semibold">{capacity.unknownRequestEstimates} requests</dd></div>
      </dl>
      {capacity.configured && !capacity.reconciliation && <div role="status" className="rounded-md border border-amber-400/50 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
        Allocation is unreconciled. Legacy and request-derived values may overlap, so total allocation and remaining capacity are not calculated.
      </div>}
      {capacity.reconciliation && <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          {capacity.reconciliation === 'REPLACED_BY_REQUESTS'
            ? 'Request planning replaces the legacy allocation.'
            : 'Legacy allocation is retained as work outside VPO.'}
        </p>
        <dl className="grid gap-4 sm:grid-cols-3">
          <div><dt className="text-xs text-muted-foreground">Effective allocation</dt><dd className="font-semibold">{capacity.effectiveAllocatedDays} days</dd></div>
          <div><dt className="text-xs text-muted-foreground">Remaining</dt><dd className="font-semibold">{capacity.remainingDays} days</dd></div>
          <div><dt className="text-xs text-muted-foreground">Over-allocation</dt><dd className={capacity.overAllocatedDays ? 'font-semibold text-destructive' : 'font-semibold'}>{capacity.overAllocatedDays} days</dd></div>
        </dl>
      </div>}
      {isAdmin && capacity.configured && <div className="flex flex-wrap gap-2">
        <form action={reconcile}>
          <input type="hidden" name="quarter" value={capacity.quarter} />
          <input type="hidden" name="reconciliation" value="REPLACED_BY_REQUESTS" />
          <Button type="submit" size="sm" variant="outline" disabled={pending}>Use request planning</Button>
        </form>
        <form action={reconcile}>
          <input type="hidden" name="quarter" value={capacity.quarter} />
          <input type="hidden" name="reconciliation" value="RETAINED_AS_OUTSIDE_WORK" />
          <Button type="submit" size="sm" variant="outline" disabled={pending}>Retain legacy as outside work</Button>
        </form>
      </div>}
      {feedback && <p role="status" className="text-sm">{feedback}</p>}
    </CardContent>
  </Card>
}

function PlanningTable({ title, description, rows, members, objectives, canEdit }: {
  title: string
  description: string
  rows: PlanningRow[]
  members: Props['members']
  objectives: Props['objectives']
  canEdit: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<Record<string, string>>({})

  function save(formData: FormData) {
    const requestId = String(formData.get('requestId'))
    startTransition(async () => {
      const result = await updatePlanningRequestAction(formData)
      setFeedback(current => ({ ...current, [requestId]: result.error ?? 'Planning saved.' }))
      if (result.success) router.refresh()
    })
  }

  return <section aria-labelledby={`planning-${title.toLowerCase()}`} className="space-y-2">
    <div>
      <h2 id={`planning-${title.toLowerCase()}`} className="text-lg font-semibold">{title}</h2>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
    <Card className="py-0">
      {rows.length === 0 ? <CardContent className="py-6 text-sm text-muted-foreground">No requests in this commitment.</CardContent> : <Table>
        <TableHeader><TableRow>
          <TableHead>Request</TableHead><TableHead>Assignee</TableHead><TableHead>Commitment</TableHead>
          <TableHead>Target period</TableHead><TableHead>Manual rank</TableHead><TableHead>AI priority</TableHead>
          <TableHead>Objective</TableHead><TableHead>Planned effort</TableHead><TableHead>Story points</TableHead>
          {canEdit && <TableHead>Action</TableHead>}
        </TableRow></TableHeader>
        <TableBody>{rows.map(row => {
          const formId = `planning-form-${row.id}`
          return <TableRow key={`${row.id}-${row.planningVersion}-${row.updatedAt}`}>
            <TableCell className="max-w-56 whitespace-normal"><Link className="font-medium hover:underline" href={`/requests/${row.id}`}>{row.title}</Link><p className="text-xs text-muted-foreground">{row.status.replaceAll('_', ' ').toLowerCase()}</p></TableCell>
            <TableCell><label className="sr-only" htmlFor={`${formId}-assignee`}>Assignee for {row.title}</label><select id={`${formId}-assignee`} form={formId} name="assigneeId" defaultValue={row.assigneeId ?? ''} disabled={!canEdit || pending} className="h-9 max-w-40 rounded-md border bg-background px-2"><option value="">Unassigned</option>{members.map(member => <option value={member.id} key={member.id}>{member.name ?? member.email}</option>)}</select></TableCell>
            <TableCell><label className="sr-only" htmlFor={`${formId}-commitment`}>Commitment for {row.title}</label><select id={`${formId}-commitment`} form={formId} name="commitment" defaultValue={row.commitment ?? ''} disabled={!canEdit || pending} className="h-9 rounded-md border bg-background px-2"><option value="">Uncommitted</option><option value="NOW">Now</option><option value="NEXT">Next</option><option value="LATER">Later</option></select></TableCell>
            <TableCell><label className="sr-only" htmlFor={`${formId}-period`}>Target period for {row.title}</label><Input id={`${formId}-period`} form={formId} name="targetPeriod" pattern="[0-9]{4}-Q[1-4]" placeholder="YYYY-Q1" defaultValue={row.targetPeriod ?? ''} disabled={!canEdit || pending} className="w-28" /></TableCell>
            <TableCell><label className="sr-only" htmlFor={`${formId}-rank`}>Manual rank for {row.title}</label><Input id={`${formId}-rank`} form={formId} name="manualRank" type="number" min="1" max="100000" defaultValue={row.manualRank ?? ''} disabled={!canEdit || pending} className="w-20" /></TableCell>
            <TableCell>{row.priorityScore == null ? 'Unscored' : row.priorityScore}</TableCell>
            <TableCell><label className="sr-only" htmlFor={`${formId}-objective`}>Objective for {row.title}</label><select id={`${formId}-objective`} form={formId} name="objectiveId" defaultValue={row.objectiveId ?? ''} disabled={!canEdit || pending} className="h-9 max-w-44 rounded-md border bg-background px-2"><option value="">No objective</option>{row.objectiveId && !objectives.some(objective => objective.id === row.objectiveId) && <option value={row.objectiveId}>{row.objectiveTitle ?? 'Inactive objective'} (inactive)</option>}{objectives.map(objective => <option value={objective.id} key={objective.id}>{objective.title}</option>)}</select></TableCell>
            <TableCell><label className="sr-only" htmlFor={`${formId}-effort`}>Planned effort in days for {row.title}</label><div className="flex items-center gap-1"><Input id={`${formId}-effort`} form={formId} name="plannedEffortDays" type="number" min="0" max="100000" step="0.25" defaultValue={row.plannedEffortDays ?? ''} disabled={!canEdit || pending} className="w-24" /><span className="text-xs text-muted-foreground">days</span></div></TableCell>
            <TableCell>{row.storyPointsTotal || row.unknownStoryPointsCount ? <>{row.storyPointsTotal} points{row.unknownStoryPointsCount ? ` + ${row.unknownStoryPointsCount} unknown` : ''}</> : <span className="text-muted-foreground">Unknown</span>}</TableCell>
            {canEdit && <TableCell><form id={formId} action={save}><input type="hidden" name="requestId" value={row.id} /><input type="hidden" name="expectedUpdatedAt" value={row.updatedAt} /><input type="hidden" name="expectedPlanningVersion" value={row.planningVersion} /><Button type="submit" size="sm" disabled={pending} aria-label={`Save planning for ${row.title}`}>Save</Button></form>{feedback[row.id] && <p role="status" className="mt-1 max-w-40 whitespace-normal text-xs">{feedback[row.id]}</p>}</TableCell>}
          </TableRow>
        })}</TableBody>
      </Table>}
    </Card>
  </section>
}

export function PlanningBoard({ requests, members, objectives, capacity, canEdit, isAdmin }: Props) {
  return <div className="space-y-8">
    <CapacitySummary capacity={capacity} isAdmin={isAdmin} />
    <p className="text-sm text-muted-foreground">Target periods are planning intentions. They are not guaranteed delivery dates.</p>
    {GROUPS.map(group => <PlanningTable key={group.title} title={group.title} description={group.description}
      rows={requests.filter(request => request.commitment === group.value)} members={members} objectives={objectives} canEdit={canEdit} />)}
  </div>
}
