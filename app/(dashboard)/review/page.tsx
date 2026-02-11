import Link from "next/link"
import { requireAuth } from "@/lib/auth/session"
import { listFeatureRequests } from "@/lib/db/queries/feature-requests"
import { StatusBadge } from "@/components/requests/StatusBadge"
import { PriorityBadge } from "@/components/requests/PriorityBadge"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import "@/lib/auth/types"

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

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

  const requests = [
    ...underReview.requests,
    ...needsInfo.requests,
  ].sort((a, b) => {
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
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Complexity</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((request) => (
                <TableRow key={request.id}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/requests/${request.id}`}
                      className="hover:underline"
                    >
                      {request.title}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={request.status} />
                  </TableCell>
                  <TableCell>
                    <PriorityBadge score={request.priorityScore} />
                  </TableCell>
                  <TableCell>
                    {request.complexity ? (
                      <Badge variant="outline">{request.complexity}</Badge>
                    ) : (
                      <span className="text-muted-foreground">--</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(request.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}
