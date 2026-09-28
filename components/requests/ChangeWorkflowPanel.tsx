"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { moveChangeRequest } from "@/app/(dashboard)/requests/[id]/change-workflow-actions"

export interface ChangeWorkflowAction {
  to: string
  label: string
  reason: boolean
  fields: { field: string; label: string; value: string }[]
}

/** State, recorded details and the moves this user may make on a change request. */
export function ChangeWorkflowPanel({ requestId, state, stateLabel, version, details, actions }: {
  requestId: string
  state: string
  stateLabel: string
  version: number
  details: { label: string; value: string }[]
  actions: ChangeWorkflowAction[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState<ChangeWorkflowAction | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [reason, setReason] = useState("")
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)

  function start(action: ChangeWorkflowAction) {
    setOpen(action)
    setValues(Object.fromEntries(action.fields.map(f => [f.field, f.value])))
    setReason("")
    setError("")
  }

  async function confirm(action: ChangeWorkflowAction) {
    setPending(true)
    const result = await moveChangeRequest({ requestId, expectedState: state, to: action.to, fields: values, reason })
    setPending(false)
    if (result.error) { setError(result.error); return }
    setOpen(null)
    router.refresh()
  }

  return <Card>
    <CardHeader className="flex flex-row flex-wrap items-center gap-2 space-y-0">
      <CardTitle className="text-base">Workflow</CardTitle>
      <Badge>{stateLabel}</Badge>
      <span className="text-xs text-muted-foreground">Workflow v{version}</span>
    </CardHeader>
    <CardContent className="space-y-4">
      {details.length > 0 && <dl className="space-y-2 text-sm">
        {details.map(d => <div key={d.label}><dt className="font-medium">{d.label}</dt><dd className="whitespace-pre-wrap break-words text-muted-foreground">{d.value}</dd></div>)}
      </dl>}
      {actions.length === 0
        ? <p className="text-sm text-muted-foreground">There are no actions for you at this stage.</p>
        : <div className="flex flex-wrap gap-2">
            {actions.map(a => <Button key={a.to} type="button" variant={open?.to === a.to ? "default" : "outline"} size="sm" onClick={() => start(a)}>{a.label}</Button>)}
          </div>}
      {open && <form className="space-y-3" onSubmit={event => { event.preventDefault(); void confirm(open) }}>
        {open.fields.map(f => <div key={f.field} className="space-y-1">
          <Label htmlFor={`wf-${f.field}`}>{f.label}</Label>
          <Textarea id={`wf-${f.field}`} required value={values[f.field] ?? ""} onChange={e => setValues(v => ({ ...v, [f.field]: e.target.value }))} />
        </div>)}
        {open.reason && <div className="space-y-1">
          <Label htmlFor="wf-reason">Reason</Label>
          <Textarea id="wf-reason" required value={reason} onChange={e => setReason(e.target.value)} />
        </div>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" size="sm" disabled={pending}>Confirm: {open.label}</Button>
      </form>}
    </CardContent>
  </Card>
}
