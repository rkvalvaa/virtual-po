import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { AgentUsageSummary } from "@/lib/db/queries/agent-usage"

const AGENT_LABELS: Record<string, string> = {
  intake: "Intake",
  assessment: "Assessment",
  output: "Output",
  security: "Security",
}

const integerFormat = new Intl.NumberFormat("en-US")
const usdFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
})

function formatDuration(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`
}

interface AgentUsageCardProps {
  summary: AgentUsageSummary
}

export function AgentUsageCard({ summary }: AgentUsageCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Agent usage</CardTitle>
        <CardDescription>
          Token spend and latency per agent. Cost is estimated from list
          pricing, not billed usage.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {summary.rows.length === 0 ? (
          <p className="text-muted-foreground py-12 text-center text-sm">
            No agent calls recorded for this period.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">Input tokens</TableHead>
                <TableHead className="text-right">Output tokens</TableHead>
                <TableHead className="text-right">Est. cost</TableHead>
                <TableHead className="text-right">Avg duration</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.rows.map((row) => (
                <TableRow key={row.agent}>
                  <TableCell className="font-medium">
                    {AGENT_LABELS[row.agent] ?? row.agent}
                  </TableCell>
                  <TableCell className="text-right">
                    {integerFormat.format(row.calls)}
                  </TableCell>
                  <TableCell className="text-right">
                    {integerFormat.format(row.inputTokens)}
                  </TableCell>
                  <TableCell className="text-right">
                    {integerFormat.format(row.outputTokens)}
                  </TableCell>
                  <TableCell className="text-right">
                    {usdFormat.format(row.estimatedCostUsd)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatDuration(row.avgDurationMs)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-medium">Total</TableCell>
                <TableCell className="text-right">
                  {integerFormat.format(summary.total.calls)}
                </TableCell>
                <TableCell className="text-right">
                  {integerFormat.format(summary.total.inputTokens)}
                </TableCell>
                <TableCell className="text-right">
                  {integerFormat.format(summary.total.outputTokens)}
                </TableCell>
                <TableCell className="text-right">
                  {usdFormat.format(summary.total.estimatedCostUsd)}
                </TableCell>
                <TableCell className="text-right">
                  {formatDuration(summary.total.avgDurationMs)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
