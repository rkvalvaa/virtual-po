"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { claimQueueRequest, moveQueueRequest, reassignQueueRequest } from "@/app/(dashboard)/queue/actions"

const selectClass = "block h-9 w-full max-w-full rounded-md border border-input bg-background px-2 text-sm"

/** Claim for members; reassign and move (with a reason) for leads and admins. */
export function QueueRowActions({ requestId, title, groupId, assigneeId, members, groups, canClaim, canManage }: {
  requestId: string
  title: string
  groupId: string
  assigneeId: string | null
  members: { userId: string; label: string }[]
  groups: { id: string; name: string }[]
  canClaim: boolean
  canManage: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState<"reassign" | "move" | null>(null)
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)
  const others = members.filter(m => m.userId !== assigneeId)
  const targets = groups.filter(g => g.id !== groupId)

  async function run(work: () => Promise<{ error?: string }>) {
    setPending(true)
    setError("")
    const result = await work()
    setPending(false)
    if (result.error) { setError(result.error); return }
    setOpen(null)
    router.refresh()
  }
  const field = (form: HTMLFormElement, name: string) => String(new FormData(form).get(name) ?? "")

  return <div className="min-w-0 space-y-2">
    <div className="flex flex-wrap gap-2">
      {canClaim && !assigneeId && <Button type="button" size="sm" disabled={pending} aria-label={`Claim ${title}`} onClick={() => void run(() => claimQueueRequest(requestId))}>Claim</Button>}
      {canManage && others.length > 0 && <Button type="button" size="sm" variant="outline" aria-label={`Reassign ${title}`} onClick={() => setOpen(open === "reassign" ? null : "reassign")}>Reassign</Button>}
      {canManage && targets.length > 0 && <Button type="button" size="sm" variant="outline" aria-label={`Move ${title}`} onClick={() => setOpen(open === "move" ? null : "move")}>Move</Button>}
    </div>
    {open === "reassign" && <form className="space-y-2" onSubmit={event => {
      event.preventDefault()
      const form = event.currentTarget
      void run(() => reassignQueueRequest({ requestId, expectedAssigneeId: assigneeId, toUserId: field(form, "user"), reason: field(form, "reason") }))
    }}>
      <div><Label htmlFor={`assignee-${requestId}`}>New assignee</Label>
        <select id={`assignee-${requestId}`} name="user" className={selectClass}>{others.map(m => <option key={m.userId} value={m.userId}>{m.label}</option>)}</select></div>
      <div><Label htmlFor={`reason-${requestId}`}>Reason</Label><Textarea id={`reason-${requestId}`} name="reason" required maxLength={1000} /></div>
      <Button type="submit" size="sm" disabled={pending}>Confirm reassignment</Button>
    </form>}
    {open === "move" && <form className="space-y-2" onSubmit={event => {
      event.preventDefault()
      const form = event.currentTarget
      void run(() => moveQueueRequest({ requestId, expectedGroupId: groupId, toGroupId: field(form, "group"), reason: field(form, "reason") }))
    }}>
      <div><Label htmlFor={`group-${requestId}`}>New group</Label>
        <select id={`group-${requestId}`} name="group" className={selectClass}>{targets.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div>
      <div><Label htmlFor={`reason-${requestId}`}>Reason</Label><Textarea id={`reason-${requestId}`} name="reason" required maxLength={1000} /></div>
      <Button type="submit" size="sm" disabled={pending}>Confirm move</Button>
    </form>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>
}
