import { beforeEach, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LinearStatusSyncSettings } from './LinearStatusSyncSettings'

const actions = vi.hoisted(() => ({ overview: vi.fn(), states: vi.fn(), save: vi.fn(), reconcile: vi.fn(), resolve: vi.fn() }))
vi.mock('@/app/(dashboard)/settings/linear-actions', () => ({
  getLinearStatusSyncOverview: actions.overview,
  loadLinearStatusWorkflowStates: actions.states,
  saveLinearStatusSync: actions.save,
  reconcileLinearStatusSync: actions.reconcile,
  resolveLinearStatusSyncConflict: actions.resolve,
}))

beforeEach(() => {
  vi.resetAllMocks()
  actions.overview.mockResolvedValue({ success: true, overview: {
    config: { enabled: true, mappings: [{ remoteStatusId: 'started', remoteStatusName: 'Started', targetStatus: 'IN_PROGRESS' }], checkpointAt: null, lastSyncAt: '2026-09-09T09:00:00.000Z', lastError: 'Linear credentials are unavailable or revoked.', failureCount: 3 },
    conflicts: [{ id: 'conflict-1', requestId: 'request-1', requestTitle: 'Customer portal', remoteStatusName: 'Done', mappedStatus: 'COMPLETED', localStatus: 'IN_BACKLOG', reason: 'The VPO status changed.' }],
  } })
  actions.states.mockResolvedValue({ success: true, states: [{ id: 'done', name: 'Done', type: 'completed' }] })
  actions.save.mockResolvedValue({ success: true })
  actions.reconcile.mockResolvedValue({ success: true, result: { observed: 1, applied: 1, skipped: 0, conflicts: 0, failed: 0, deduplicated: 0 } })
  actions.resolve.mockResolvedValue({ success: true })
})

it('shows sync health, mappings, reconciliation, and human conflict resolution', async () => {
  const user = userEvent.setup()
  render(<LinearStatusSyncSettings teamId="team-1" isAdmin />)
  expect(await screen.findByText(/credentials are unavailable or revoked/i)).toBeInTheDocument()
  expect(screen.getByText(/3 failed attempts/i)).toBeInTheDocument()
  expect(screen.getByText('Started')).toBeInTheDocument()
  expect(screen.getByText('IN PROGRESS')).toBeInTheDocument()
  expect(screen.getByText('Customer portal')).toBeInTheDocument()
  expect(screen.getByText(/IN BACKLOG → COMPLETED/)).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: /reconcile linked issues/i }))
  await waitFor(() => expect(actions.reconcile).toHaveBeenCalledWith('team-1'))
  await user.click(screen.getByRole('button', { name: /keep local status for Customer portal/i }))
  await waitFor(() => expect(actions.resolve).toHaveBeenCalledWith('team-1', 'conflict-1', 'KEEP_LOCAL'))
})

it('does not expose configuration controls to non-admins', async () => {
  render(<LinearStatusSyncSettings teamId="team-1" isAdmin={false} />)
  await screen.findByText('Started')
  expect(screen.queryByRole('button', { name: /load linear statuses/i })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /reconcile/i })).not.toBeInTheDocument()
})
