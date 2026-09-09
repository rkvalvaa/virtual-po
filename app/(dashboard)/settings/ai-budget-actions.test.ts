import { beforeEach, describe, expect, it, vi } from 'vitest'
import { updateAIBudgetAction } from './ai-budget-actions'
import { requireAuth } from '@/lib/auth/session'
import { updateOrganizationAgentBudget } from '@/lib/db/queries/agent-budget'

vi.mock('@/lib/auth/session', () => ({ requireAuth: vi.fn() }))
vi.mock('@/lib/db/queries/agent-budget', () => ({ updateOrganizationAgentBudget: vi.fn() }))
vi.mock('@/lib/agents/budget', () => ({ deploymentBudgetCeilingMicrousd: () => 100_000_000 }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

describe('updateAIBudgetAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireAuth).mockResolvedValue({ user: { id: 'user-1', orgId: 'org-1', role: 'ADMIN' } } as never)
    vi.mocked(updateOrganizationAgentBudget).mockResolvedValue({ version: 2 })
  })

  it('converts exact USD input to micros and delegates current membership authorization', async () => {
    const data = new FormData()
    data.set('monthlyLimitUsd', '12.345678')
    data.set('warningPercent', '75')
    data.set('expectedVersion', '1')
    await expect(updateAIBudgetAction(data)).resolves.toEqual({ success: true, version: 2 })
    expect(updateOrganizationAgentBudget).toHaveBeenCalledWith({
      orgId: 'org-1', adminUserId: 'user-1', monthlyLimitMicrousd: 12_345_678,
      warningPercent: 75, expectedVersion: 1, deploymentCeilingMicrousd: 100_000_000,
    })
  })

  it('rejects malformed values and attempts above the server ceiling', async () => {
    const malformed = new FormData()
    malformed.set('monthlyLimitUsd', '1e2')
    malformed.set('warningPercent', '80')
    malformed.set('expectedVersion', '0')
    expect((await updateAIBudgetAction(malformed)).success).toBe(false)

    const excessive = new FormData()
    excessive.set('monthlyLimitUsd', '101')
    excessive.set('warningPercent', '80')
    excessive.set('expectedVersion', '0')
    expect((await updateAIBudgetAction(excessive)).success).toBe(false)
    expect(updateOrganizationAgentBudget).not.toHaveBeenCalled()
  })
})
