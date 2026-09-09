import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AIBudgetSettings } from './AIBudgetSettings'
import { updateAIBudgetAction } from '@/app/(dashboard)/settings/ai-budget-actions'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/app/(dashboard)/settings/ai-budget-actions', () => ({
  updateAIBudgetAction: vi.fn(async () => ({ success: true })),
}))

const status = {
  enabled: true,
  deploymentCeilingMicrousd: 100_000_000,
  configuredLimitMicrousd: 50_000_000,
  effectiveLimitMicrousd: 50_000_000,
  measuredMicrousd: 1_250_000,
  reservedMicrousd: 4_000_000,
  unknownReservedMicrousd: 2_000_000,
  remainingMicrousd: 42_750_000,
  unknownSettlements: 1,
  resetAt: '2026-10-01T00:00:00.000Z',
  version: 2,
  warningPercent: 80,
  blockReason: null,
  userRunsRemaining: 55,
  orgRunsRemaining: 290,
  concurrentRunsRemaining: 2,
  userRunResetAt: '2026-09-09T13:00:00.000Z',
  orgRunResetAt: '2026-09-09T13:00:00.000Z',
}

describe('AI budget settings', () => {
  beforeEach(() => vi.clearAllMocks())

  it('labels calculated spend as estimates and reports reservations and allowances', () => {
    render(<AIBudgetSettings status={status} userRole="STAKEHOLDER" />)
    expect(screen.getByText('Estimated measured spend')).toBeVisible()
    expect(screen.getByText('$1.25')).toBeVisible()
    expect(screen.getByText(/provider billing statement/i)).toBeVisible()
    expect(screen.getByText('Held reservations')).toBeVisible()
    expect(screen.getByText(/1 unknown settlement/)).toBeVisible()
    expect(screen.getByText(/55 personal/)).toBeVisible()
    expect(screen.queryByRole('button', { name: /save budget/i })).not.toBeInTheDocument()
  })

  it('lets administrators tighten the deployment ceiling and submits the version', async () => {
    const user = userEvent.setup()
    render(<AIBudgetSettings status={status} userRole="ADMIN" />)
    expect(screen.getByLabelText('Monthly workspace limit (USD)')).toHaveAttribute('max', '100')
    expect(document.querySelector('input[name="expectedVersion"]')).toHaveValue('2')
    await user.clear(screen.getByLabelText('Monthly workspace limit (USD)'))
    await user.type(screen.getByLabelText('Monthly workspace limit (USD)'), '40')
    await user.click(screen.getByRole('button', { name: /save budget/i }))
    expect(updateAIBudgetAction).toHaveBeenCalled()
  })

  it('keeps the editable values and optimistic version in the same refreshed snapshot', async () => {
    const user = userEvent.setup()
    const view = render(<AIBudgetSettings status={status} userRole="ADMIN" />)
    await user.clear(screen.getByLabelText('Monthly workspace limit (USD)'))
    await user.type(screen.getByLabelText('Monthly workspace limit (USD)'), '45')
    view.rerender(<AIBudgetSettings status={{ ...status, configuredLimitMicrousd: 30_000_000, effectiveLimitMicrousd: 30_000_000, version: 3 }} userRole="ADMIN" />)
    expect(screen.getByLabelText('Monthly workspace limit (USD)')).toHaveValue(30)
    expect(document.querySelector('input[name="expectedVersion"]')).toHaveValue('3')
  })

  it('explains when deployment budgets are unavailable', () => {
    render(<AIBudgetSettings status={{ ...status, enabled: false, deploymentCeilingMicrousd: null, effectiveLimitMicrousd: null, configuredLimitMicrousd: null, remainingMicrousd: null }} userRole="ADMIN" />)
    expect(screen.getByText(/deployment ceiling is not configured/i)).toBeVisible()
    expect(screen.queryByRole('button', { name: /save budget/i })).not.toBeInTheDocument()
  })
})
