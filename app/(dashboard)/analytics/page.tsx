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
  getTopVotedRequests,
  getVoteTrend,
  getVoteSummaryStats,
  getDecisionBreakdown,
  getUserDashboardStats,
} from "@/lib/db/queries/analytics"
import type { DateRange } from "@/lib/db/queries/analytics"
import { DashboardCharts } from "./DashboardCharts"
import { AdvancedCharts } from "./AdvancedCharts"
import { VoteAnalytics } from "./VoteAnalytics"
import { DateRangeFilter } from "@/components/analytics/DateRangeFilter"
import { MyStatsCard } from "@/components/analytics/MyStatsCard"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ExportButton } from "@/components/shared/ExportButton"
import "@/lib/auth/types"

interface AnalyticsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function AnalyticsPage({ searchParams }: AnalyticsPageProps) {
  const session = await requireAuth()
  const orgId = session.user.orgId

  if (!orgId) {
    return (
      <div className="text-muted-foreground py-12 text-center text-sm">
        No organization found. Please contact an administrator.
      </div>
    )
  }

  const params = await searchParams
  const from = typeof params.from === 'string' ? params.from : undefined
  const to = typeof params.to === 'string' ? params.to : undefined
  const dateRange: DateRange | undefined =
    from && to ? { from, to } : undefined

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
    topVotedRequests,
    voteTrend,
    voteSummaryStats,
    decisionBreakdown,
    userStats,
  ] = await Promise.all([
    getDashboardSummary(orgId, dateRange),
    getStatusDistribution(orgId, dateRange),
    getRequestVolumeByMonth(orgId, dateRange),
    getPriorityDistribution(orgId, dateRange),
    getAverageTimeToDecision(orgId, dateRange),
    getTopRequesters(orgId, 5, dateRange),
    getEstimateAccuracySummary(orgId, dateRange),
    getStakeholderEngagement(orgId, 10, dateRange),
    getTimeToDecisionTrend(orgId, dateRange),
    getConfidenceTrend(orgId, dateRange),
    getDecisionOutcomeDistribution(orgId, dateRange),
    getTopVotedRequests(orgId, 10, dateRange),
    getVoteTrend(orgId, dateRange),
    getVoteSummaryStats(orgId, dateRange),
    getDecisionBreakdown(orgId, dateRange),
    getUserDashboardStats(orgId, session.user.id),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Overview of feature request activity and metrics
          </p>
        </div>
        <ExportButton
          exportUrl="/api/export/analytics"
          filename="analytics.csv"
        />
      </div>

      <DateRangeFilter />

      <MyStatsCard stats={userStats} />

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

      {/* Voting & Decisions */}
      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight">Voting & Decisions</h2>
        <p className="text-muted-foreground text-sm">
          Stakeholder voting activity, decision rates, and top-voted requests.
        </p>
      </div>

      <VoteAnalytics
        voteSummary={voteSummaryStats}
        topVotedRequests={topVotedRequests}
        voteTrend={voteTrend}
        decisionBreakdown={decisionBreakdown}
      />

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
