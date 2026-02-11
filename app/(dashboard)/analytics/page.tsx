import { requireAuth } from "@/lib/auth/session"
import {
  getDashboardSummary,
  getStatusDistribution,
  getRequestVolumeByMonth,
  getPriorityDistribution,
  getAverageTimeToDecision,
  getTopRequesters,
} from "@/lib/db/queries/analytics"
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
import { DashboardCharts } from "./DashboardCharts"
import "@/lib/auth/types"

export default async function AnalyticsPage() {
  const session = await requireAuth()
  const orgId = session.user.orgId

  if (!orgId) {
    return (
      <div className="text-muted-foreground py-12 text-center text-sm">
        No organization found. Please contact an administrator.
      </div>
    )
  }

  const [summary, statusDist, volumeByMonth, priorityDist, timeToDecision, topRequesters] =
    await Promise.all([
      getDashboardSummary(orgId),
      getStatusDistribution(orgId),
      getRequestVolumeByMonth(orgId),
      getPriorityDistribution(orgId),
      getAverageTimeToDecision(orgId),
      getTopRequesters(orgId),
    ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground text-sm">
          Overview of feature request activity and metrics.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Requests</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{summary.totalRequests}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pending Review</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{summary.pendingReview}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>In Backlog</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{summary.inBacklog}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Completed</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{summary.completed}</p>
          </CardContent>
        </Card>
      </div>

      {/* Secondary metrics */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Avg Quality Score</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {summary.avgQualityScore != null
                ? `${summary.avgQualityScore}/100`
                : "\u2014"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Avg Time to Decision</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {timeToDecision.avgDays != null
                ? `${timeToDecision.avgDays}d`
                : "\u2014"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <DashboardCharts
        statusDistribution={statusDist}
        requestVolume={volumeByMonth}
        priorityDistribution={priorityDist}
      />

      {/* Top Requesters */}
      {topRequesters.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Top Requesters</CardTitle>
            <CardDescription>
              Users with the most feature requests.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Requests</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topRequesters.map((requester) => (
                  <TableRow key={requester.userId}>
                    <TableCell className="font-medium">
                      {requester.name ?? "Unknown"}
                    </TableCell>
                    <TableCell className="text-right">
                      {requester.count}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
