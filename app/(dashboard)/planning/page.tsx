import { requireAuth } from '@/lib/auth/session'
import { canAccess } from '@/lib/auth/rbac'
import { getPlanningBoard, getPlanningCapacity } from '@/lib/db/queries/planning'
import { getOrganizationUsers } from '@/lib/db/queries/organizations'
import { getActiveObjectives } from '@/lib/db/queries/okrs'
import { PlanningBoard } from '@/components/planning/PlanningBoard'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export default async function PlanningPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireAuth()
  const orgId = session.user.orgId
  if (!orgId) return <p className="py-12 text-center text-sm text-muted-foreground">No organization found.</p>
  const params = await searchParams
  const now = new Date()
  const currentQuarter = `${now.getFullYear()}-Q${Math.ceil((now.getMonth() + 1) / 3)}`
  const submittedQuarter = typeof params.quarter === 'string' ? params.quarter : ''
  const quarter = /^[0-9]{4}-Q[1-4]$/.test(submittedQuarter) ? submittedQuarter : currentQuarter
  const [requests, members, objectives, capacity] = await Promise.all([
    getPlanningBoard(orgId),
    getOrganizationUsers(orgId),
    getActiveObjectives(orgId),
    getPlanningCapacity(orgId, quarter),
  ])
  return <div className="space-y-6">
    <div><h1 className="text-2xl font-bold tracking-tight">Delivery planning</h1>
      <p className="text-sm text-muted-foreground">Assign ownership and plan request commitments against team capacity.</p></div>
    <form method="get" className="flex flex-wrap items-end gap-2">
      <div className="space-y-1"><label htmlFor="planning-quarter" className="text-sm font-medium">Capacity quarter</label><Input id="planning-quarter" name="quarter" pattern="[0-9]{4}-Q[1-4]" defaultValue={quarter} className="w-32" /></div>
      <Button type="submit" variant="outline">View quarter</Button>
    </form>
    <PlanningBoard
      requests={requests.map(request => ({ ...request, updatedAt: request.updatedAt.toISOString() }))}
      members={members.map(member => ({ id: member.user.id, name: member.user.name, email: member.user.email }))}
      objectives={objectives.map(objective => ({ id: objective.id, title: objective.title }))}
      capacity={capacity}
      canEdit={canAccess(session.user.role, 'REVIEWER')}
      isAdmin={session.user.role === 'ADMIN'}
    />
  </div>
}
