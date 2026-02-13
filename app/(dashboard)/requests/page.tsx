import Link from "next/link"
import { requireAuth } from "@/lib/auth/session"
import { listFeatureRequests } from "@/lib/db/queries/feature-requests"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { BulkRequestTable } from "@/components/requests/BulkRequestTable"
import { getVoteSummariesByRequestIds } from "@/lib/db/queries/votes"
import { Plus } from "lucide-react"

export default async function RequestsPage() {
  const session = await requireAuth()
  const orgId = session.user.orgId

  if (!orgId) {
    return (
      <div className="text-muted-foreground py-12 text-center text-sm">
        No organization found. Please contact an administrator.
      </div>
    )
  }

  const { requests, total } = await listFeatureRequests(orgId)
  const voteSummaries = await getVoteSummariesByRequestIds(requests.map((r) => r.id))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Feature Requests</h1>
          <p className="text-muted-foreground text-sm">
            {total} request{total !== 1 ? "s" : ""} total
          </p>
        </div>
        <Button asChild>
          <Link href="/requests/new">
            <Plus />
            New Request
          </Link>
        </Button>
      </div>

      {requests.length === 0 ? (
        <Card>
          <CardHeader className="items-center text-center">
            <CardTitle>No requests yet</CardTitle>
            <CardDescription>
              Create your first feature request to get started with the intake
              process.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Button asChild>
              <Link href="/requests/new">
                <Plus />
                New Request
              </Link>
            </Button>
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
          columns={["quality"]}
          statusActions={[
            { label: "Move to Backlog", targetStatus: "IN_BACKLOG" },
          ]}
        />
      )}
    </div>
  )
}
