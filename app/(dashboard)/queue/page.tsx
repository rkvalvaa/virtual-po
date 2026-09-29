import type { Metadata } from "next"
import Link from "next/link"
import { requireAuth } from "@/lib/auth/session"
import { listGroupQueue, listQueueGroups } from "@/lib/db/queries/group-queue"
import { listServiceGroups } from "@/lib/db/queries/service-groups"
import { changeWorkflow, CHANGE_STATES, CURRENT_CHANGE_WORKFLOW_VERSION } from "@/lib/workflows/change-request"
import type { UserRole } from "@/lib/types/database"
import { QueueRowActions } from "@/components/queue/QueueRowActions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

export const metadata: Metadata = { title: "Service queues" }

const DELIVERY_LABELS = { QUEUED: "Linear: queued", DELIVERED: "Linear: delivered", NEEDS_ATTENTION: "Linear: needs attention", FAILED: "Linear: failed" }
const selectClass = "block h-9 w-full max-w-full rounded-md border border-input bg-background px-2 text-sm"

export default async function QueuePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireAuth()
  const { orgId, id: userId } = session.user
  const role = session.user.role as UserRole
  const params = await searchParams
  const groups = await listQueueGroups(orgId, userId, role)

  if (!groups.length) {
    return <div className="mx-auto max-w-2xl space-y-2 py-12 text-center">
      <h1 className="text-2xl font-semibold">Service queues</h1>
      <p className="text-sm text-muted-foreground">You are not in any service group. An admin can add you under Settings, Service Groups.</p>
    </div>
  }

  const group = groups.find(g => g.id === params.group) ?? groups[0]
  const members = ((await listServiceGroups(orgId)).find(g => g.id === group.id)?.members ?? []).map(m => ({ userId: m.userId, label: m.name ?? m.email }))
  const assignee = typeof params.assignee === "string" && (["unassigned", "me"].includes(params.assignee) || members.some(m => m.userId === params.assignee))
    ? params.assignee : undefined
  const state = typeof params.state === "string" && (CHANGE_STATES as readonly string[]).includes(params.state) ? params.state : undefined
  const rows = await listGroupQueue(orgId, userId, role, group.id, { assignee, state }) ?? []
  const states = changeWorkflow(CURRENT_CHANGE_WORKFLOW_VERSION).states
  const canManage = group.myRole === "LEAD" || role === "ADMIN"

  return <div className="space-y-4">
    <h1 className="text-2xl font-semibold">Service queues</h1>
    <nav aria-label="Service groups" className="flex flex-wrap gap-2">
      {groups.map(g => <Button key={g.id} asChild size="sm" variant={g.id === group.id ? "default" : "outline"}>
        <Link href={`/queue?group=${g.id}`} aria-current={g.id === group.id ? "page" : undefined}>{g.name}</Link>
      </Button>)}
    </nav>
    <form className="flex flex-wrap items-end gap-2" action="/queue">
      <input type="hidden" name="group" value={group.id} />
      <div className="min-w-0"><label htmlFor="queue-assignee" className="text-sm">Assignee</label>
        <select id="queue-assignee" name="assignee" defaultValue={assignee ?? ""} className={selectClass}>
          <option value="">Anyone</option><option value="unassigned">Unassigned</option><option value="me">Me</option>
          {members.map(m => <option key={m.userId} value={m.userId}>{m.label}</option>)}
        </select></div>
      <div className="min-w-0"><label htmlFor="queue-state" className="text-sm">State</label>
        <select id="queue-state" name="state" defaultValue={state ?? ""} className={selectClass}>
          <option value="">Any state</option>
          {CHANGE_STATES.map(s => <option key={s} value={s}>{states[s]}</option>)}
        </select></div>
      <Button type="submit" size="sm" variant="outline">Filter</Button>
    </form>
    <section aria-label={`${group.name} queue`}>
      {!rows.length && <p className="text-sm text-muted-foreground">No change requests match.</p>}
      <ul className="space-y-3">
        {rows.map(row => <li key={row.id}><Card><CardContent className="space-y-2 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/requests/${row.id}`} className="min-w-0 break-words font-medium underline">{row.title}</Link>
            <Badge variant="secondary">{row.stateLabel}</Badge>
            {row.delivery && <Badge variant="outline">{DELIVERY_LABELS[row.delivery]}</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">{row.assigneeName ? `Assigned to ${row.assigneeName}` : "Unassigned"} · filed {new Date(row.createdAt).toLocaleDateString()}</p>
          <QueueRowActions requestId={row.id} title={row.title} groupId={group.id} assigneeId={row.assigneeId} members={members}
            groups={groups.map(g => ({ id: g.id, name: g.name }))} canClaim={group.myRole !== null} canManage={canManage} />
        </CardContent></Card></li>)}
      </ul>
    </section>
  </div>
}
