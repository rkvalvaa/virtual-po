"use client"

import Link from "next/link"
import { Star } from "lucide-react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { StatusBadge } from "@/components/requests/StatusBadge"

interface VoteAnalyticsProps {
  voteSummary: {
    totalVotes: number
    uniqueVoters: number
    avgScore: number
    votedRequestsCount: number
    totalRequestsCount: number
  }
  topVotedRequests: Array<{
    requestId: string
    title: string
    voteCount: number
    averageScore: number
    status: string
  }>
  voteTrend: Array<{
    month: string
    voteCount: number
    avgScore: number
    uniqueVoters: number
  }>
  decisionBreakdown: Array<{
    decision: string
    count: number
  }>
}

function formatMonth(month: string): string {
  const [year, m] = month.split("-")
  const date = new Date(parseInt(year), parseInt(m) - 1)
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" })
}

const DECISION_COLORS: Record<string, string> = {
  APPROVE: "#22c55e",
  REJECT: "#ef4444",
  DEFER: "#eab308",
  REQUEST_INFO: "#3b82f6",
}

export function VoteAnalytics({
  voteSummary,
  topVotedRequests,
  voteTrend,
  decisionBreakdown,
}: VoteAnalyticsProps) {
  const trendData = voteTrend.map((row) => ({
    ...row,
    label: formatMonth(row.month),
  }))

  const participationRate =
    voteSummary.totalRequestsCount > 0
      ? Math.round(
          (voteSummary.votedRequestsCount / voteSummary.totalRequestsCount) * 100
        )
      : 0

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Vote Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 md:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground text-sm font-medium">
              Total Votes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{voteSummary.totalVotes}</p>
            <p className="text-muted-foreground text-xs">
              by {voteSummary.uniqueVoters} voter
              {voteSummary.uniqueVoters !== 1 ? "s" : ""}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground text-sm font-medium">
              Avg. Vote Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <p className="text-3xl font-bold">
                {voteSummary.totalVotes > 0
                  ? voteSummary.avgScore.toFixed(1)
                  : "--"}
              </p>
              {voteSummary.totalVotes > 0 && (
                <Star className="h-6 w-6 fill-yellow-400 text-yellow-400" />
              )}
            </div>
            <p className="text-muted-foreground text-xs">out of 5.0</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground text-sm font-medium">
              Vote Participation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{participationRate}%</p>
            <p className="text-muted-foreground text-xs">
              {voteSummary.votedRequestsCount} of{" "}
              {voteSummary.totalRequestsCount} requests voted on
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground text-sm font-medium">
              Decision Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            {decisionBreakdown.length > 0 ? (
              <div className="space-y-1.5">
                {decisionBreakdown.map((row) => {
                  const total = decisionBreakdown.reduce(
                    (sum, r) => sum + r.count,
                    0
                  )
                  const pct = Math.round((row.count / total) * 100)
                  return (
                    <div
                      key={row.decision}
                      className="flex items-center justify-between text-sm"
                    >
                      <span className="capitalize">
                        {row.decision.toLowerCase().replace(/_/g, " ")}
                      </span>
                      <span className="font-medium">
                        {row.count} ({pct}%)
                      </span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">No decisions yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Vote Trend */}
      <Card>
        <CardHeader>
          <CardTitle>Vote Activity Trend</CardTitle>
        </CardHeader>
        <CardContent>
          {trendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart
                data={trendData}
                margin={{ top: 0, right: 20, bottom: 0, left: 0 }}
              >
                <defs>
                  <linearGradient
                    id="voteGradient"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor="#eab308" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#eab308" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="voteCount"
                  name="Votes"
                  stroke="#eab308"
                  fill="url(#voteGradient)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-muted-foreground py-12 text-center text-sm">
              No vote data yet.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Decision Type Distribution */}
      <Card>
        <CardHeader>
          <CardTitle>Decision Type Distribution</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center">
          {decisionBreakdown.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={decisionBreakdown}
                  dataKey="count"
                  nameKey="decision"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={(props) => `${props.name}: ${props.value}`}
                >
                  {decisionBreakdown.map((entry) => (
                    <Cell
                      key={entry.decision}
                      fill={DECISION_COLORS[entry.decision] ?? "#94a3b8"}
                    />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-muted-foreground py-12 text-center text-sm">
              No decisions yet.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Top Voted Requests */}
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>Top Voted Requests</CardTitle>
        </CardHeader>
        <CardContent>
          {topVotedRequests.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Avg Score</TableHead>
                  <TableHead className="text-right">Votes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topVotedRequests.map((row) => (
                  <TableRow key={row.requestId}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/requests/${row.requestId}`}
                        className="hover:underline"
                      >
                        {row.title}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={row.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                        {row.averageScore.toFixed(1)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{row.voteCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground py-12 text-center text-sm">
              No votes yet. Stakeholders can vote on feature requests to
              influence prioritization.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
