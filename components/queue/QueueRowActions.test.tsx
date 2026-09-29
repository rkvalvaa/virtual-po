import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mocks = vi.hoisted(() => ({ claim: vi.fn(), reassign: vi.fn(), move: vi.fn(), refresh: vi.fn() }))
vi.mock('@/app/(dashboard)/queue/actions', () => ({ claimQueueRequest: mocks.claim, reassignQueueRequest: mocks.reassign, moveQueueRequest: mocks.move }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))

import { QueueRowActions } from './QueueRowActions'

const base = {
  requestId: 'r1', title: 'Rotate certificates', groupId: 'g1', assigneeId: null as string | null,
  members: [{ userId: 'u1', label: 'Ada' }, { userId: 'u2', label: 'Rex' }],
  groups: [{ id: 'g1', name: 'IT Operations' }, { id: 'g2', name: 'Facilities' }],
}

describe('QueueRowActions', () => {
  beforeEach(() => {
    for (const fn of [mocks.claim, mocks.reassign, mocks.move]) fn.mockReset().mockResolvedValue({})
    mocks.refresh.mockReset()
  })

  it('lets a member claim an unassigned request, and shows who beat them to it', async () => {
    const user = userEvent.setup()
    mocks.claim.mockResolvedValueOnce({ error: 'This request is already claimed by Rex.' })
    render(<QueueRowActions {...base} canClaim canManage={false} />)
    expect(screen.queryByRole('button', { name: 'Reassign Rotate certificates' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Claim Rotate certificates' }))
    expect(mocks.claim).toHaveBeenCalledWith('r1')
    expect(await screen.findByRole('alert')).toHaveTextContent('already claimed by Rex')
  })

  it('lets a lead reassign with a reason, sending the assignment they saw', async () => {
    const user = userEvent.setup()
    render(<QueueRowActions {...base} assigneeId="u1" canClaim canManage />)
    expect(screen.queryByRole('button', { name: 'Claim Rotate certificates' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Reassign Rotate certificates' }))
    await user.selectOptions(screen.getByLabelText('New assignee'), 'u2')
    await user.type(screen.getByLabelText('Reason'), 'Ada is on leave')
    await user.click(screen.getByRole('button', { name: 'Confirm reassignment' }))
    expect(mocks.reassign).toHaveBeenCalledWith({ requestId: 'r1', expectedAssigneeId: 'u1', toUserId: 'u2', reason: 'Ada is on leave' })
    expect(mocks.refresh).toHaveBeenCalled()
  })

  it('lets a lead move the request to another group with a reason', async () => {
    const user = userEvent.setup()
    render(<QueueRowActions {...base} canClaim={false} canManage />)
    await user.click(screen.getByRole('button', { name: 'Move Rotate certificates' }))
    expect(screen.getAllByRole('option').map(o => o.textContent)).toEqual(['Facilities'])
    await user.type(screen.getByLabelText('Reason'), 'Building access')
    await user.click(screen.getByRole('button', { name: 'Confirm move' }))
    expect(mocks.move).toHaveBeenCalledWith({ requestId: 'r1', expectedGroupId: 'g1', toGroupId: 'g2', reason: 'Building access' })
  })
})
