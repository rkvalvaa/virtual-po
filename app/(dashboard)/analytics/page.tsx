import { requireAuth } from "@/lib/auth/session"
import {
  getDashboardSummary,
  getStatusDistribution,
  getRequestVolumeByMonth,
  getPriorityDistribution,
  getAverageTimeToDecision,
  getTopRequesters,
  getEstimateAccuracySummary,
  getStakeholderEngagement,
  getTimeToDecisionTrend,
  getConfidenceTrend,
  getDecisionOutcomeDistribution,
} from "@/lib/db/queries/analytics"
import { DashboardCharts } from "./DashboardCharts"
import { AdvancedCharts } from "./AdvancedCharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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

  const [
    summary,
    statusDistribution,
    requestVolume,
    priorityDistribution,
    timeToDecision,
    topRequesters,
    estimateAccuracy,
    stakeholderEngagement,
    timeToDecisionTrend,
    confidenceTrend,
    outcomeDistribution,
  ] = await Promise.all([
    getDashboardSummary(orgId),
    getStatusDistribution(orgId),
    getRequestVolumeByMonth(orgId),
    getPriorityDistribution(orgId),
    getAverageTimeToDecision(orgId),
    getTopRequesters(orgId),
    getEstimateAccuracySummary(orgId),
    getStakeholderEngagement(orgId),
    getTimeToDecisionTrend(orgId),
    getConfidenceTrend(orgId),
    getDecisionOutcomeDistribution(orgId),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Overview of feature request activity and metrics
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground text-sm font-medium">
              Total Requests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{summary.totalRequests}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground text-sm font-medium">
              Pending Review
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{summary.pendingReview}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground text-sm font-medium">
              In Backlog
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{summary.inBacklog}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground text-sm font-medium">
              Completed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{summary.completed}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground text-sm font-medium">
              Avg. Time to Decision
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {timeToDecision.avgDays != null
                ? `${timeToDecision.avgDays} days`
                : "--"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground text-sm font-medium">
              Avg. Quality Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {summary.avgQualityScore != null
                ? `${summary.avgQualityScore}%`
                : "--"}
            </p>
          </CardContent>
        </Card>
      </div>

      <DashboardCharts
        statusDistribution={statusDistribution}
        requestVolume={requestVolume}
        priorityDistribution={priorityDistribution}
      />

      {topRequesters.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Top Requesters</CardTitle>
          </CardHeader>
          <CardContent>
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
                      {requester.name}
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

      {/* Advanced Analytics */}
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight">Advanced Analytics</h2>
        <p className="text-muted-foreground text-sm">
          Deeper insights into estimation accuracy, engagement, and decision patterns.
        </p>
      </div>

      <AdvancedCharts
        estimateAccuracy={estimateAccuracy}
        stakeholderEngagement={stakeholderEngagement}
        timeToDecisionTrend={timeToDecisionTrend}
        confidenceTrend={confidenceTrend}
        outcomeDistribution={outcomeDistribution}
      />
    </div>
  )
}
