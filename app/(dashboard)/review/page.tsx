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

export default async function ReviewQueuePage() {
  const session = await requireAuth()
  const orgId = session.user.orgId

  if (!orgId) {
    return (
      <div className="text-muted-foreground py-12 text-center text-sm">
        No organization found. Please contact an administrator.
      </div>
    )
  }

  const [underReview, needsInfo] = await Promise.all([
    listFeatureRequests(orgId, { status: "UNDER_REVIEW" }),
    listFeatureRequests(orgId, { status: "NEEDS_INFO" }),
  ])

  const allReqs = [...underReview.requests, ...needsInfo.requests]
  const voteSummaries = await getVoteSummariesByRequestIds(allReqs.map((r) => r.id))

  const requests = allReqs.sort((a, b) => {
    if (a.priorityScore === null && b.priorityScore === null) return 0
    if (a.priorityScore === null) return 1
    if (b.priorityScore === null) return -1
    return b.priorityScore - a.priorityScore
  })

  const totalCount = requests.length

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Review Queue</h1>
          <Badge variant="secondary">{totalCount}</Badge>
        </div>
        <p className="text-muted-foreground mt-1 text-sm">
          Feature requests pending review and decision. Sorted by priority score.
        </p>
      </div>

      {requests.length === 0 ? (
        <Card>
          <CardHeader className="items-center text-center">
            <CardTitle>No requests pending review</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-center text-sm">
            Requests that are ready for review will appear here.
          </CardContent>
        </Card>
      ) : (
        <BulkRequestTable
          requests={requests.map((r) => ({
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
            { label: "Approve", targetStatus: "APPROVED" },
            { label: "Reject", targetStatus: "REJECTED" },
            { label: "Defer", targetStatus: "DEFERRED" },
          ]}
        />
      )}
    </div>
  )
}
