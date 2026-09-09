"use client"

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateAIBudgetAction } from '@/app/(dashboard)/settings/ai-budget-actions'
import type { AgentBudgetStatus } from '@/lib/db/queries/agent-budget'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

export function AIBudgetSettings({ status, userRole, deploymentConfiguration = 'READY' }: {
  status: AgentBudgetStatus
  userRole: string
  deploymentConfiguration?: 'READY' | 'UNCONFIGURED' | 'INVALID'
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<string | null>(null)
  const isAdmin = userRole === 'ADMIN'
  const ceilingUsd = status.deploymentCeilingMicrousd === null ? null : status.deploymentCeilingMicrousd / 1_000_000
  const limitUsd = (status.configuredLimitMicrousd ?? status.deploymentCeilingMicrousd ?? 0) / 1_000_000

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    startTransition(async () => {
      const result = await updateAIBudgetAction(data)
      setFeedback(result.success ? 'AI budget saved.' : result.error ?? 'Unable to save the AI budget.')
      if (result.success) router.refresh()
    })
  }

  return <div className="space-y-4">
    <Card>
      <CardHeader>
        <CardTitle>AI usage and allowance</CardTitle>
        <CardDescription>Monthly estimates reset {formatDate(status.resetAt)}. Monetary values are calculated estimates, not a provider billing statement.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Estimated measured spend" value={formatMoney(status.measuredMicrousd)} />
          <Metric label="Held reservations" value={formatMoney(status.reservedMicrousd + status.unknownReservedMicrousd)} />
          <Metric label="Estimated remaining budget" value={status.remainingMicrousd === null ? 'Unavailable' : formatMoney(status.remainingMicrousd)} />
          <Metric label="Monthly estimated limit" value={status.effectiveLimitMicrousd === null ? 'Unavailable' : formatMoney(status.effectiveLimitMicrousd)} />
        </dl>
        <p className="text-sm text-muted-foreground">
          {status.unknownSettlements} unknown {status.unknownSettlements === 1 ? 'settlement' : 'settlements'} retain their full reservations until reconciled.
        </p>
        <div className="rounded-md border p-4">
          <p className="text-sm font-medium">Run allowance</p>
          <p className="text-sm text-muted-foreground">{status.userRunsRemaining} personal · {status.orgRunsRemaining} workspace · {status.concurrentRunsRemaining} concurrent slots remaining</p>
          {(status.userRunResetAt || status.orgRunResetAt) && <p className="mt-1 text-xs text-muted-foreground">The next hourly slot resets by {formatDate(earliest(status.userRunResetAt, status.orgRunResetAt)!)}.</p>}
        </div>
        {status.blockReason && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{status.blockReason}</p>}
      </CardContent>
    </Card>

    <Card id="ai-budget">
      <CardHeader>
        <CardTitle>Workspace AI budget</CardTitle>
        <CardDescription>Administrators may tighten the deployment ceiling. Changes are version checked and apply to new runs.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {deploymentConfiguration === 'INVALID' && <p role="alert" className="text-sm text-destructive">The deployment ceiling is invalid. Correct AI_BUDGET_MAX_MONTHLY_USD before running AI or saving a workspace limit.</p>}
        {(deploymentConfiguration === 'UNCONFIGURED' || !status.enabled) && deploymentConfiguration !== 'INVALID' && <p className="text-sm text-muted-foreground">The deployment ceiling is not configured, so hard workspace budgets are unavailable. Usage and reservations are still recorded.</p>}
        {status.enabled && <p className="text-sm text-muted-foreground">Deployment ceiling: {formatMoney(status.deploymentCeilingMicrousd!)}</p>}
        {isAdmin && status.enabled && ceilingUsd !== null && <form key={status.version} onSubmit={save} className="space-y-4">
          <input aria-label="Configuration version" type="hidden" name="expectedVersion" value={status.version} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="ai-budget-limit" className="text-sm font-medium">Monthly workspace limit (USD)</label>
              <Input id="ai-budget-limit" name="monthlyLimitUsd" type="number" min="0.000001" max={String(ceilingUsd)} step="0.000001" defaultValue={String(limitUsd)} required disabled={pending} />
            </div>
            <div className="space-y-1">
              <label htmlFor="ai-budget-warning" className="text-sm font-medium">Warning threshold (%)</label>
              <Input id="ai-budget-warning" name="warningPercent" type="number" min="1" max="100" step="1" defaultValue={status.warningPercent} required disabled={pending} />
            </div>
          </div>
          <Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save budget'}</Button>
        </form>}
        {feedback && <p role="status" className="text-sm">{feedback}</p>}
      </CardContent>
    </Card>
  </div>
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs font-medium text-muted-foreground">{label}</dt><dd className="text-2xl font-bold">{value}</dd></div>
}

function formatMoney(microusd: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(microusd / 1_000_000)
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString()
}

function earliest(first: string | null, second: string | null): string | null {
  if (!first) return second
  if (!second) return first
  return new Date(first) <= new Date(second) ? first : second
}
