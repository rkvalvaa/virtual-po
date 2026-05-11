"use client"

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

interface BurndownPoint {
  day: string
  openCount: number
  idealCount: number
}

interface BurndownChartProps {
  data: BurndownPoint[]
}

function formatDay(day: unknown): string {
  if (typeof day !== "string") return ""
  const date = new Date(day + "T00:00:00Z")
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

export function BurndownChart({ data }: BurndownChartProps) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Backlog burndown</CardTitle>
          <CardDescription>
            Open backlog count over time, with an ideal linear burndown for reference.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground py-12 text-center text-sm">
            Not enough data to render a burndown.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Backlog burndown</CardTitle>
        <CardDescription>
          Open backlog count over time, with an ideal linear burndown for reference.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data} margin={{ left: 0, right: 16, top: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="day"
              tickFormatter={formatDay}
              minTickGap={32}
              className="text-xs"
            />
            <YAxis allowDecimals={false} className="text-xs" />
            <Tooltip
              labelFormatter={formatDay}
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                color: "var(--popover-foreground)",
              }}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="idealCount"
              name="Ideal"
              stroke="#94a3b8"
              strokeDasharray="4 4"
              dot={false}
              strokeWidth={2}
            />
            <Line
              type="monotone"
              dataKey="openCount"
              name="Open backlog"
              stroke="var(--chart-1)"
              dot={false}
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
