"use client"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
} from "recharts"

interface DashboardChartsProps {
  statusDistribution: Array<{ status: string; count: number }>
  requestVolume: Array<{ month: string; count: number }>
  priorityDistribution: Array<{ band: string; count: number }>
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "hsl(var(--muted-foreground))",
  INTAKE_IN_PROGRESS: "hsl(210, 80%, 55%)",
  PENDING_ASSESSMENT: "hsl(40, 90%, 55%)",
  UNDER_REVIEW: "hsl(270, 60%, 55%)",
  NEEDS_INFO: "hsl(30, 90%, 55%)",
  APPROVED: "hsl(142, 60%, 45%)",
  REJECTED: "hsl(0, 70%, 55%)",
  DEFERRED: "hsl(200, 20%, 55%)",
  IN_BACKLOG: "hsl(210, 50%, 55%)",
  IN_PROGRESS: "hsl(210, 90%, 55%)",
  COMPLETED: "hsl(142, 70%, 40%)",
}

const PRIORITY_COLORS: Record<string, string> = {
  High: "hsl(142, 60%, 45%)",
  Medium: "hsl(40, 90%, 55%)",
  Low: "hsl(var(--muted-foreground))",
  Unscored: "hsl(200, 10%, 70%)",
}

function formatStatus(status: string): string {
  return status
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function DashboardCharts({
  statusDistribution,
  requestVolume,
  priorityDistribution,
}: DashboardChartsProps) {
  const statusData = statusDistribution.map((d) => ({
    name: formatStatus(d.status),
    value: d.count,
    fill: STATUS_COLORS[d.status] ?? "hsl(var(--muted-foreground))",
  }))

  const volumeData = requestVolume.map((d) => ({
    month: d.month,
    count: d.count,
  }))

  const priorityData = priorityDistribution.map((d) => ({
    name: d.band,
    value: d.count,
    fill: PRIORITY_COLORS[d.band] ?? "hsl(var(--muted-foreground))",
  }))

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Request Volume Over Time */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Request Volume</CardTitle>
          <CardDescription>Feature requests over the last 12 months.</CardDescription>
        </CardHeader>
        <CardContent>
          {volumeData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={volumeData}>
                <XAxis dataKey="month" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="hsl(210, 80%, 55%)"
                  fill="hsl(210, 80%, 55%)"
                  fillOpacity={0.15}
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

      {/* Status Distribution */}
      <Card>
        <CardHeader>
          <CardTitle>Status Distribution</CardTitle>
          <CardDescription>Requests by current status.</CardDescription>
        </CardHeader>
        <CardContent>
          {statusData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={statusData} layout="vertical">
                <XAxis type="number" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="name" fontSize={11} tickLine={false} axisLine={false} width={120} />
                <Tooltip />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {statusData.map((entry, index) => (
                    <Cell key={index} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-muted-foreground py-12 text-center text-sm">
              No data yet.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Priority Distribution */}
      <Card>
        <CardHeader>
          <CardTitle>Priority Distribution</CardTitle>
          <CardDescription>Requests by priority band.</CardDescription>
        </CardHeader>
        <CardContent>
          {priorityData.length > 0 ? (
            <div className="flex items-center justify-center">
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={priorityData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    innerRadius={50}
                    strokeWidth={2}
                    stroke="hsl(var(--background))"
                  >
                    {priorityData.map((entry, index) => (
                      <Cell key={index} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-muted-foreground py-12 text-center text-sm">
              No data yet.
            </p>
          )}
          {priorityData.length > 0 && (
            <div className="mt-2 flex flex-wrap justify-center gap-4 text-xs">
              {priorityData.map((d) => (
                <span key={d.name} className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: d.fill }}
                  />
                  {d.name} ({d.value})
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
