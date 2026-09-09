import { beforeEach, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TrackerImport } from './TrackerImport'

const actions = vi.hoisted(() => ({ preview: vi.fn(), runImport: vi.fn(), resolve: vi.fn() }))
vi.mock('@/app/(dashboard)/settings/linear-actions', () => ({
  previewLinearImport: actions.preview,
  importLinearPage: actions.runImport,
  resolveLinearImportConflict: actions.resolve,
}))
vi.mock('@/app/(dashboard)/settings/jira-actions', () => ({ previewJiraImport: vi.fn(), importJiraPage: vi.fn(), resolveJiraImportConflict: vi.fn() }))
vi.mock('@/app/(dashboard)/settings/github-issues-actions', () => ({ previewGitHubImport: vi.fn(), importGitHubPage: vi.fn(), resolveGitHubImportConflict: vi.fn() }))

const item = {
  provider: 'LINEAR' as const,
  destination: 'team-id',
  remoteEntityId: 'stable-id',
  displayId: 'ENG-42',
  title: 'Customer dashboard',
  description: 'The full tracker description',
  sourceUrl: 'https://linear/ENG-42',
  labels: ['Customer', 'Urgent'],
  remoteStatus: { id: 'started', name: 'In Progress' },
}

beforeEach(() => {
  vi.resetAllMocks()
  actions.preview.mockResolvedValue({ success: true, page: { items: [item], nextCursor: 'page-2' } })
  actions.runImport.mockResolvedValue({
    success: true,
    result: { created: 1, updated: 0, skipped: 0, failed: 0, items: [{ remoteEntityId: 'stable-id', displayId: 'ENG-42', outcome: 'created', requestId: 'request-id', linkId: 'link-id', conflicts: [] }] },
  })
  actions.resolve.mockResolvedValue({ success: true, item: { remoteEntityId: 'stable-id', outcome: 'updated', requestId: 'request-id', linkId: 'link-id', conflicts: [] } })
})

it('shows the explicit metadata mapping before a preview', () => {
  render(<TrackerImport provider="LINEAR" destination="team-id" />)
  const mapping = screen.getByRole('table', { name: 'Linear import field mapping' })
  expect(within(mapping).getByText('Description')).toBeInTheDocument()
  expect(within(mapping).getByText('Summary')).toBeInTheDocument()
  expect(within(mapping).getByText('Source URL')).toBeInTheDocument()
  expect(within(mapping).getByText('External URL')).toBeInTheDocument()
  expect(within(mapping).getByText('Remote status')).toBeInTheDocument()
  expect(within(mapping).getByText(/import metadata/i)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /import selected/i })).not.toBeInTheDocument()
})

it('requires preview, shows full context, and reports outcome progress', async () => {
  const user = userEvent.setup()
  render(<TrackerImport provider="LINEAR" destination="team-id" />)
  await user.click(screen.getByRole('button', { name: 'Preview Linear issues' }))
  expect(actions.preview).toHaveBeenCalledWith({ teamId: 'team-id', searchQuery: undefined, cursor: null })
  expect(screen.getByRole('link', { name: 'ENG-42 Customer dashboard' })).toHaveAttribute('href', 'https://linear/ENG-42')
  expect(screen.getByText('The full tracker description')).toBeInTheDocument()
  expect(screen.getByText('Customer')).toBeInTheDocument()
  expect(screen.getByText('In Progress')).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: 'Import selected (1)' }))
  expect(actions.runImport).toHaveBeenCalledWith({ teamId: 'team-id', searchQuery: undefined, cursor: null, remoteEntityIds: ['stable-id'] })
  const progress = screen.getByRole('status')
  expect(progress).toHaveTextContent('Created 1')
  expect(progress).toHaveTextContent('Updated 0')
  expect(progress).toHaveTextContent('Skipped 0')
  expect(progress).toHaveTextContent('Failed 0')
})

it('moves through preview pages and can return to the prior cursor', async () => {
  const user = userEvent.setup()
  actions.preview
    .mockResolvedValueOnce({ success: true, page: { items: [item], nextCursor: 'page-2' } })
    .mockResolvedValueOnce({ success: true, page: { items: [{ ...item, remoteEntityId: 'second', displayId: 'ENG-43', title: 'Second page' }], nextCursor: null } })
    .mockResolvedValueOnce({ success: true, page: { items: [item], nextCursor: 'page-2' } })
  render(<TrackerImport provider="LINEAR" destination="team-id" />)
  await user.click(screen.getByRole('button', { name: 'Preview Linear issues' }))
  const next = await screen.findByRole('button', { name: 'Next page' })
  await waitFor(() => expect(next).toBeEnabled())
  await user.click(next)
  expect(actions.preview).toHaveBeenCalledTimes(2)
  expect(actions.preview).toHaveBeenLastCalledWith({ teamId: 'team-id', searchQuery: undefined, cursor: 'page-2' })
  expect(await screen.findByRole('link', { name: 'ENG-43 Second page' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Previous page' }))
  expect(actions.preview).toHaveBeenLastCalledWith({ teamId: 'team-id', searchQuery: undefined, cursor: null })
})

it('surfaces failed items and resolves each conflicted field explicitly', async () => {
  const user = userEvent.setup()
  actions.runImport.mockResolvedValueOnce({
    success: true,
    result: {
      created: 0, updated: 0, skipped: 1, failed: 1,
      items: [
        { remoteEntityId: 'stable-id', displayId: 'ENG-42', outcome: 'skipped', requestId: 'request-id', linkId: 'link-id', conflicts: [{ field: 'title', localValue: 'Local title', remoteValue: 'Remote title' }] },
        { remoteEntityId: 'failed-id', displayId: 'ENG-99', outcome: 'failed', conflicts: [], error: 'Remote description was invalid.' },
      ],
    },
  })
  render(<TrackerImport provider="LINEAR" destination="team-id" />)
  await user.click(screen.getByRole('button', { name: 'Preview Linear issues' }))
  const importButton = await screen.findByRole('button', { name: 'Import selected (1)' })
  await waitFor(() => expect(importButton).toBeEnabled())
  await user.click(importButton)
  expect(actions.runImport).toHaveBeenCalledTimes(1)
  expect(await screen.findByText(/Remote description was invalid\./)).toBeInTheDocument()
  expect(screen.getAllByText(/local title/i)).not.toHaveLength(0)
  expect(screen.getByText(/remote title/i)).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Use tracker title for ENG-42' }))
  expect(actions.resolve).toHaveBeenCalledWith('link-id', { title: 'REMOTE' })
  expect(screen.queryByRole('button', { name: /use tracker title/i })).not.toBeInTheDocument()
})
