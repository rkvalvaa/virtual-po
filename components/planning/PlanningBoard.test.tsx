import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const update = vi.hoisted(() => vi.fn(async () => ({ success: true })))
const reconcile = vi.hoisted(() => vi.fn(async () => ({ success: true })))
vi.mock('@/app/(dashboard)/planning/actions', () => ({
  updatePlanningRequestAction: update,
  reconcileCapacityAction: reconcile,
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

import { PlanningBoard } from './PlanningBoard'

const requests = [{
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Keyboard plan',
  status: 'IN_BACKLOG' as const,
  assigneeId: null,
  assigneeName: null,
  commitment: 'NOW' as const,
  targetPeriod: '2026-Q4',
  manualRank: 1,
  objectiveId: null,
  objectiveTitle: null,
  plannedEffortDays: null,
  priorityScore: 88,
  storyPointsTotal: 8,
  unknownStoryPointsCount: 1,
  updatedAt: '2026-09-09T08:00:00.000Z',
  planningVersion: 0,
}]

describe('PlanningBoard', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows distinct manual and AI fields, explicit units, accessible controls, and no drag affordance', () => {
    const { container } = render(<PlanningBoard
      requests={requests}
      members={[{ id: '22222222-2222-4222-8222-222222222222', name: 'Current member', email: 'member@example.test' }]}
      objectives={[]}
      capacity={{ quarter: '2026-Q4', configured: true, notes: null, totalCapacityDays: 100, legacyAllocatedDays: 70,
        requestDerivedDays: 0, unknownRequestEstimates: 1, reconciliation: null, reconciledAt: null,
        effectiveAllocatedDays: null, remainingDays: null, overAllocatedDays: null }}
      canEdit
      isAdmin
    />)
    expect(screen.getByRole('heading', { name: 'Now' })).toBeInTheDocument()
    expect(screen.getByLabelText('Commitment for Keyboard plan')).toBeInTheDocument()
    expect(screen.getByText('AI priority')).toBeInTheDocument()
    expect(screen.getByText('Manual rank')).toBeInTheDocument()
    expect(screen.getByText('8 points + 1 unknown')).toBeInTheDocument()
    expect(screen.getByText(/unreconciled/i)).toBeInTheDocument()
    expect(screen.queryByText(/^remaining$/i)).not.toBeInTheDocument()
    expect(container.querySelector('[draggable="true"]')).toBeNull()
  })

  it('submits row edits from native table controls', async () => {
    render(<PlanningBoard
      requests={requests}
      members={[]}
      objectives={[]}
      capacity={{ quarter: '2026-Q4', configured: false, notes: null, totalCapacityDays: 0, legacyAllocatedDays: 0,
        requestDerivedDays: 0, unknownRequestEstimates: 1, reconciliation: null, reconciledAt: null,
        effectiveAllocatedDays: null, remainingDays: null, overAllocatedDays: null }}
      canEdit
      isAdmin={false}
    />)
    fireEvent.click(screen.getByRole('button', { name: 'Save planning for Keyboard plan' }))
    await vi.waitFor(() => expect(update).toHaveBeenCalledOnce())
  })

  it('remounts controls with refreshed values when the concurrency token changes', () => {
    const props = {
      members: [] as { id: string; name: string | null; email: string }[],
      objectives: [] as { id: string; title: string }[],
      capacity: { quarter: '2026-Q4', configured: false, notes: null, totalCapacityDays: 0, legacyAllocatedDays: 0,
        requestDerivedDays: 0, unknownRequestEstimates: 1, reconciliation: null, reconciledAt: null,
        effectiveAllocatedDays: null, remainingDays: null, overAllocatedDays: null },
      canEdit: true,
      isAdmin: false,
    }
    const view = render(<PlanningBoard requests={requests} {...props} />)
    fireEvent.change(screen.getByLabelText('Target period for Keyboard plan'), { target: { value: '2099-Q1' } })
    view.rerender(<PlanningBoard requests={[{ ...requests[0], commitment: 'NEXT', targetPeriod: '2027-Q1', planningVersion: 1,
      updatedAt: '2026-09-09T08:01:00.000Z' }]} {...props} />)
    expect(screen.getByLabelText('Commitment for Keyboard plan')).toHaveValue('NEXT')
    expect(screen.getByLabelText('Target period for Keyboard plan')).toHaveValue('2027-Q1')
  })
})
