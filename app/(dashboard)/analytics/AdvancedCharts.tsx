"use client"

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
  LineChart,
  Line,
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

interface AdvancedChartsProps {
  estimateAccuracy: {
    totalCompared: number
    matchCount: number
    accuracyPercent: number
    byComplexity: Array<{
      complexity: string
      predictedCount: number
      matchedCount: number
      accuracyPercent: number
    }>
  }
  stakeholderEngagement: Array<{
    userId: string
    name: string
    requestCount: number
    commentCount: number
    voteCount: number
    avgQualityScore: number | null
    lastActivityAt: string | null
  }>
  timeToDecisionTrend: Array<{
    month: string
    avgDays: number
    decisionCount: number
  }>
  confidenceTrend: Array<{
    month: string
    avgBusinessScore: number
    avgTechnicalScore: number
    avgRiskScore: number
    assessmentCount: number
  }>
  outcomeDistribution: Array<{
    outcome: string
    count: number
  }>
}

function formatMonth(month: string): string {
  const [year, m] = month.split("-")
  const date = new Date(parseInt(year), parseInt(m) - 1)
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" })
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

const OUTCOME_COLORS: Record<string, string> = {
  CORRECT: "#22c55e",
  PARTIALLY_CORRECT: "#eab308",
  INCORRECT: "#ef4444",
  PENDING: "#94a3b8",
}

export function AdvancedCharts({
  estimateAccuracy,
  stakeholderEngagement,
  timeToDecisionTrend,
  confidenceTrend,
  outcomeDistribution,
}: AdvancedChartsProps) {
  const decisionData = timeToDecisionTrend.map((row) => ({
    ...row,
    label: formatMonth(row.month),
  }))

  const confidenceData = confidenceTrend.map((row) => ({
    ...row,
    label: formatMonth(row.month),
  }))

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Estimate Accuracy - full width */}
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>Estimate Accuracy</CardTitle>
        </CardHeader>
        <CardContent>
          {estimateAccuracy.totalCompared > 0 ? (
            <div className="space-y-4">
              <p className="text-lg font-semibold">
                {estimateAccuracy.accuracyPercent}% accurate (
                {estimateAccuracy.matchCount}/{estimateAccuracy.totalCompared}{" "}
                predictions)
              </p>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={estimateAccuracy.byComplexity}
                  layout="vertical"
                  margin={{ top: 0, right: 20, bottom: 0, left: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis
                    type="number"
                    domain={[0, 100]}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <YAxis
                    type="category"
                    dataKey="complexity"
                    width={60}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip
                    formatter={(value) => [`${value}%`, "Accuracy"]}
                  />
                  <Bar
                    dataKey="accuracyPercent"
                    fill="#22c55e"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-muted-foreground py-12 text-center text-sm">
              No calibration data yet.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Time-to-Decision Trend */}
      <Card>
        <CardHeader>
          <CardTitle>Time-to-Decision Trend</CardTitle>
        </CardHeader>
        <CardContent>
          {decisionData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart
                data={decisionData}
                margin={{ top: 0, right: 20, bottom: 0, left: 0 }}
              >
                <defs>
                  <linearGradient
                    id="decisionGradient"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor="hsl(var(--primary))"
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="95%"
                      stopColor="hsl(var(--primary))"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} />
                <Tooltip
                  formatter={(value) => [`${value} days`, "Avg Days"]}
                />
                <Area
                  type="monotone"
                  dataKey="avgDays"
                  stroke="hsl(var(--primary))"
                  fill="url(#decisionGradient)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-muted-foreground py-12 text-center text-sm">
              No data yet.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Assessment Score Trends */}
      <Card>
        <CardHeader>
          <CardTitle>Assessment Score Trends</CardTitle>
        </CardHeader>
        <CardContent>
          {confidenceData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart
                data={confidenceData}
                margin={{ top: 0, right: 20, bottom: 0, left: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="avgBusinessScore"
                  name="Business"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="avgTechnicalScore"
                  name="Technical"
                  stroke="#22c55e"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="avgRiskScore"
                  name="Risk"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-muted-foreground py-12 text-center text-sm">
              No data yet.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Decision Outcome Distribution */}
      <Card>
        <CardHeader>
          <CardTitle>Decision Outcome Distribution</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center">
          {outcomeDistribution.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={outcomeDistribution}
                  dataKey="count"
                  nameKey="outcome"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  label={(props) => `${props.name}: ${props.value}`}
                >
                  {outcomeDistribution.map((entry) => (
                    <Cell
                      key={entry.outcome}
                      fill={OUTCOME_COLORS[entry.outcome] ?? "#94a3b8"}
                    />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-muted-foreground py-12 text-center text-sm">
              No data yet.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Stakeholder Engagement */}
      <Card>
        <CardHeader>
          <CardTitle>Stakeholder Engagement</CardTitle>
        </CardHeader>
        <CardContent>
          {stakeholderEngagement.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Requests</TableHead>
                  <TableHead className="text-right">Comments</TableHead>
                  <TableHead className="text-right">Votes</TableHead>
                  <TableHead className="text-right">Avg Quality</TableHead>
                  <TableHead className="text-right">Last Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stakeholderEngagement.slice(0, 10).map((row) => (
                  <TableRow key={row.userId}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-right">
                      {row.requestCount}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.commentCount}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.voteCount}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.avgQualityScore != null
                        ? `${row.avgQualityScore}%`
                        : "--"}
                    </TableCell>
                    <TableCell className="text-right">
                      {row.lastActivityAt != null
                        ? formatDate(row.lastActivityAt)
                        : "--"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground py-12 text-center text-sm">
              No data yet.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
