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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { StatusBadge } from "@/components/requests/StatusBadge"
import { PriorityBadge } from "@/components/requests/PriorityBadge"
import { VoteBadge } from "@/components/requests/VoteBadge"
import { getVoteSummariesByRequestIds } from "@/lib/db/queries/votes"
import { Plus } from "lucide-react"

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

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
  const voteMap = new Map(voteSummaries.map((v) => [v.requestId, v]))

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
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Votes</TableHead>
                <TableHead>Quality</TableHead>
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
                    <VoteBadge
                      averageScore={voteMap.get(request.id)?.averageScore ?? 0}
                      voteCount={voteMap.get(request.id)?.voteCount ?? 0}
                    />
                  </TableCell>
                  <TableCell>
                    {request.qualityScore !== null
                      ? `${request.qualityScore}%`
                      : "--"}
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
