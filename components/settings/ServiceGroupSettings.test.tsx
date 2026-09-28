import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mocks = vi.hoisted(() => ({ manage: vi.fn(), refresh: vi.fn() }))
vi.mock('@/app/(dashboard)/settings/service-group-actions', () => ({ manageServiceGroups: mocks.manage }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))

import { ServiceGroupSettings } from './ServiceGroupSettings'

const members = [
  { userId: 'u1', label: 'Ada Admin' },
  { userId: 'u2', label: 'Rex Reviewer' },
  { userId: 'u3', label: 'sam@example.test' },
]
const groups = [{
  id: 'g1', name: 'IT Operations', fallbackOwnerId: 'u1', fallbackOwnerName: 'Ada Admin',
  members: [{ userId: 'u2', name: 'Rex Reviewer', email: 'rex@example.test', role: 'LEAD' as const }],
}]

describe('ServiceGroupSettings', () => {
  beforeEach(() => { mocks.manage.mockReset().mockResolvedValue({ success: true }); mocks.refresh.mockReset() })

  it('creates a group with a name and a fallback owner chosen from workspace members', async () => {
    const user = userEvent.setup()
    render(<ServiceGroupSettings groups={[]} members={members} />)
    expect(screen.getByText(/no service groups yet/i)).toBeInTheDocument()
    await user.type(screen.getByLabelText('Group name'), 'Facilities')
    await user.selectOptions(screen.getByLabelText('Fallback owner'), 'u2')
    await user.click(screen.getByRole('button', { name: 'Add group' }))
    expect(mocks.manage).toHaveBeenCalledWith({ kind: 'create', name: 'Facilities', fallbackOwnerId: 'u2' })
    expect(mocks.refresh).toHaveBeenCalled()
  })

  it('shows members with their role, and adds, re-roles and removes members', async () => {
    const user = userEvent.setup()
    render(<ServiceGroupSettings groups={groups} members={members} />)
    const group = screen.getByRole('region', { name: 'IT Operations' })
    expect(within(group).getByText(/Rex Reviewer · Lead/)).toBeInTheDocument()
    expect(within(group).getByText(/Fallback owner: Ada Admin/)).toBeInTheDocument()

    await user.selectOptions(within(group).getByLabelText('Add member to IT Operations'), 'u3')
    await user.selectOptions(within(group).getByLabelText('Role in IT Operations'), 'LEAD')
    await user.click(within(group).getByRole('button', { name: 'Add to IT Operations' }))
    expect(mocks.manage).toHaveBeenLastCalledWith({ kind: 'setMember', groupId: 'g1', userId: 'u3', role: 'LEAD' })

    await user.click(within(group).getByRole('button', { name: 'Remove Rex Reviewer from IT Operations' }))
    expect(mocks.manage).toHaveBeenLastCalledWith({ kind: 'removeMember', groupId: 'g1', userId: 'u2' })
  })

  it('changes the fallback owner, renames, archives, and shows a refusal', async () => {
    const user = userEvent.setup()
    mocks.manage.mockResolvedValueOnce({ success: false, error: 'A group with that name already exists.' })
    render(<ServiceGroupSettings groups={groups} members={members} />)
    const group = screen.getByRole('region', { name: 'IT Operations' })

    const rename = within(group).getByLabelText('Rename IT Operations')
    await user.clear(rename)
    await user.type(rename, 'Service Desk')
    await user.click(within(group).getByRole('button', { name: 'Save name for IT Operations' }))
    expect(mocks.manage).toHaveBeenLastCalledWith({ kind: 'rename', groupId: 'g1', name: 'Service Desk' })
    expect(await screen.findByRole('alert')).toHaveTextContent('already exists')

    await user.selectOptions(within(group).getByLabelText('Fallback owner for IT Operations'), 'u2')
    await user.click(within(group).getByRole('button', { name: 'Save fallback owner for IT Operations' }))
    expect(mocks.manage).toHaveBeenLastCalledWith({ kind: 'setFallbackOwner', groupId: 'g1', userId: 'u2' })

    await user.click(within(group).getByRole('button', { name: 'Archive IT Operations' }))
    expect(mocks.manage).toHaveBeenLastCalledWith({ kind: 'archive', groupId: 'g1' })
  })
})
