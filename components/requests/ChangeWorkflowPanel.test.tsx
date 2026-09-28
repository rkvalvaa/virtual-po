import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mocks = vi.hoisted(() => ({ move: vi.fn(), refresh: vi.fn() }))
vi.mock('@/app/(dashboard)/requests/[id]/change-workflow-actions', () => ({ moveChangeRequest: mocks.move }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))

import { ChangeWorkflowPanel } from './ChangeWorkflowPanel'

const props = {
  requestId: 'r1',
  state: 'ASSESSING',
  stateLabel: 'Assessing',
  version: 1,
  details: [{ label: 'Implementation plan', value: 'Draft plan' }],
  actions: [
    { to: 'AWAITING_APPROVAL', label: 'Request approval', reason: false, fields: [{ field: 'implementationPlan', label: 'Implementation plan', value: 'Draft plan' }] },
    { to: 'REJECTED', label: 'Reject', reason: true, fields: [] },
  ],
}

describe('ChangeWorkflowPanel', () => {
  beforeEach(() => { mocks.move.mockReset().mockResolvedValue({}); mocks.refresh.mockReset() })

  it('shows the state, the recorded details and only the offered moves', () => {
    render(<ChangeWorkflowPanel {...props} />)
    expect(screen.getByText('Assessing')).toBeInTheDocument()
    expect(screen.getByText('Workflow v1')).toBeInTheDocument()
    expect(screen.getByText('Draft plan')).toBeInTheDocument()
    expect(screen.getAllByRole('button').map(b => b.textContent)).toEqual(['Request approval', 'Reject'])
  })

  it('collects the details a move needs and sends them with the state the user saw', async () => {
    const user = userEvent.setup()
    render(<ChangeWorkflowPanel {...props} />)
    await user.click(screen.getByRole('button', { name: 'Request approval' }))
    const plan = screen.getByLabelText('Implementation plan')
    expect(plan).toHaveValue('Draft plan')
    await user.clear(plan)
    await user.type(plan, 'Two waves')
    await user.click(screen.getByRole('button', { name: 'Confirm: Request approval' }))
    expect(mocks.move).toHaveBeenCalledWith({ requestId: 'r1', expectedState: 'ASSESSING', to: 'AWAITING_APPROVAL', fields: { implementationPlan: 'Two waves' }, reason: '' })
    expect(mocks.refresh).toHaveBeenCalled()
  })

  it('asks for a reason and shows a refusal from the server', async () => {
    const user = userEvent.setup()
    mocks.move.mockResolvedValue({ error: 'This request has moved on. Reload and try again.' })
    render(<ChangeWorkflowPanel {...props} />)
    await user.click(screen.getByRole('button', { name: 'Reject' }))
    await user.type(screen.getByLabelText('Reason'), 'Duplicate')
    await user.click(screen.getByRole('button', { name: 'Confirm: Reject' }))
    expect(mocks.move).toHaveBeenCalledWith(expect.objectContaining({ to: 'REJECTED', reason: 'Duplicate', fields: {} }))
    expect(await screen.findByRole('alert')).toHaveTextContent('moved on')
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('says so when this user has no moves', () => {
    render(<ChangeWorkflowPanel {...props} actions={[]} />)
    expect(screen.getByText(/no actions for you/i)).toBeInTheDocument()
  })
})
