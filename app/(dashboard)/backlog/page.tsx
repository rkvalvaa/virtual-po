import { requireAuth } from "@/lib/auth/session"
import { listFeatureRequests } from "@/lib/db/queries/feature-requests"
import { BulkRequestTable } from "@/components/requests/BulkRequestTable"
import { getVoteSummariesByRequestIds } from "@/lib/db/queries/votes"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import "@/lib/auth/types"

export default async function BacklogPage() {
  const session = await requireAuth()
  const orgId = session.user.orgId

  if (!orgId) {
    return (
      <div className="text-muted-foreground py-12 text-center text-sm">
        No organization found. Please contact an administrator.
      </div>
    )
  }

  const [approved, inBacklog, inProgress, completed] = await Promise.all([
    listFeatureRequests(orgId, { status: "APPROVED" }),
    listFeatureRequests(orgId, { status: "IN_BACKLOG" }),
    listFeatureRequests(orgId, { status: "IN_PROGRESS" }),
    listFeatureRequests(orgId, { status: "COMPLETED" }),
  ])

  const activeRequests = [
    ...approved.requests,
    ...inBacklog.requests,
    ...inProgress.requests,
  ]

  const allRequestIds = [...activeRequests, ...completed.requests].map((r) => r.id)
  const voteSummaries = await getVoteSummariesByRequestIds(allRequestIds)

  activeRequests.sort((a, b) => {
    if (a.priorityScore === null && b.priorityScore === null) return 0
    if (a.priorityScore === null) return 1
    if (b.priorityScore === null) return -1
    return b.priorityScore - a.priorityScore
  })

  const allRequests = [...activeRequests, ...completed.requests]
  const activeCount = activeRequests.length

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Backlog</h1>
          <Badge variant="secondary">{activeCount}</Badge>
        </div>
        <p className="text-muted-foreground mt-1 text-sm">
          Approved requests and work in progress
        </p>
      </div>

      {allRequests.length === 0 ? (
        <Card>
          <CardHeader className="items-center text-center">
            <CardTitle>No items in backlog yet</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-center text-sm">
            Approve requests from the Review Queue to add them here.
          </CardContent>
        </Card>
      ) : (
        <BulkRequestTable
          requests={allRequests.map((r) => ({
            id: r.id,
            title: r.title,
            status: r.status,
            priorityScore: r.priorityScore,
            qualityScore: r.qualityScore,
            complexity: r.complexity,
            tags: r.tags,
            createdAt: r.createdAt.toISOString(),
          }))}
          voteSummaries={voteSummaries.map((v) => ({
            requestId: v.requestId,
            averageScore: v.averageScore,
            voteCount: v.voteCount,
          }))}
          columns={["complexity"]}
          statusActions={[
            { label: "Start Work", targetStatus: "IN_PROGRESS" },
            { label: "Complete", targetStatus: "COMPLETED" },
          ]}
        />
      )}
    </div>
  )
}
