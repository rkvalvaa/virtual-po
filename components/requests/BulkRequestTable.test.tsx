import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BulkRequestTable } from './BulkRequestTable'
import type { RequestStatus } from '@/lib/types/database'

const bulkUpdateStatus = vi.fn()
const bulkAddTags = vi.fn()
const bulkRemoveTags = vi.fn()

vi.mock('@/app/(dashboard)/bulk-actions', () => ({
  bulkUpdateStatus: (...args: unknown[]) => bulkUpdateStatus(...args),
  bulkAddTags: (...args: unknown[]) => bulkAddTags(...args),
  bulkRemoveTags: (...args: unknown[]) => bulkRemoveTags(...args),
}))

type Props = React.ComponentProps<typeof BulkRequestTable>

function makeRequest(overrides: Partial<Props['requests'][number]> = {}): Props['requests'][number] {
  return {
    id: 'req-1',
    title: 'Add dark mode',
    status: 'UNDER_REVIEW' as RequestStatus,
    priorityScore: 75,
    qualityScore: 80,
    complexity: 'M',
    tags: [],
    createdAt: '2026-01-15T10:00:00Z',
    ...overrides,
  }
}

function defaultProps(overrides: Partial<Props> = {}): Props {
  return {
    requests: [makeRequest()],
    voteSummaries: [],
    columns: [],
    statusActions: [],
    ...overrides,
  }
}

describe('BulkRequestTable', () => {
  beforeEach(() => {
    bulkUpdateStatus.mockReset()
    bulkAddTags.mockReset()
    bulkRemoveTags.mockReset()
  })

  describe('row rendering', () => {
    it('should render one row per request', () => {
      render(
        <BulkRequestTable
          {...defaultProps({
            requests: [
              makeRequest({ id: 'a', title: 'First' }),
              makeRequest({ id: 'b', title: 'Second' }),
              makeRequest({ id: 'c', title: 'Third' }),
            ],
          })}
        />,
      )
      expect(screen.getByText('First')).toBeInTheDocument()
      expect(screen.getByText('Second')).toBeInTheDocument()
      expect(screen.getByText('Third')).toBeInTheDocument()
    })

    it('should link each title to its request detail page', () => {
      render(
        <BulkRequestTable
          {...defaultProps({
            requests: [makeRequest({ id: 'req-42', title: 'Lookup' })],
          })}
        />,
      )
      const link = screen.getByRole('link', { name: 'Lookup' })
      expect(link).toHaveAttribute('href', '/requests/req-42')
    })

    it('should render tag badges for each tag', () => {
      render(
        <BulkRequestTable
          {...defaultProps({
            requests: [makeRequest({ tags: ['ui', 'a11y', 'backend'] })],
          })}
        />,
      )
      expect(screen.getByText('ui')).toBeInTheDocument()
      expect(screen.getByText('a11y')).toBeInTheDocument()
      expect(screen.getByText('backend')).toBeInTheDocument()
    })

    it('should show "--" for null qualityScore when quality column is enabled', () => {
      render(
        <BulkRequestTable
          {...defaultProps({
            requests: [makeRequest({ id: 'r1', title: 'No quality', qualityScore: null })],
            columns: ['quality'],
            voteSummaries: [{ requestId: 'r1', averageScore: 4, voteCount: 2 }],
          })}
        />,
      )
      // Multiple "--" can appear (e.g. for empty vote badges); ensure at
      // least the quality cell has one by scoping to the row.
      const row = screen.getByText('No quality').closest('tr') as HTMLElement
      expect(within(row).getByText('--')).toBeInTheDocument()
    })

    it('should show the percentage for non-null qualityScore', () => {
      render(
        <BulkRequestTable
          {...defaultProps({
            requests: [makeRequest({ qualityScore: 72 })],
            columns: ['quality'],
          })}
        />,
      )
      expect(screen.getByText('72%')).toBeInTheDocument()
    })

    it('should conditionally render the Complexity column when configured', () => {
      const { rerender } = render(
        <BulkRequestTable
          {...defaultProps({ columns: [] })}
        />,
      )
      expect(screen.queryByRole('columnheader', { name: /complexity/i })).not.toBeInTheDocument()

      rerender(
        <BulkRequestTable
          {...defaultProps({ columns: ['complexity'] })}
        />,
      )
      expect(screen.getByRole('columnheader', { name: /complexity/i })).toBeInTheDocument()
    })
  })

  describe('selection', () => {
    it('should not show the bulk-action bar when nothing is selected', () => {
      render(<BulkRequestTable {...defaultProps()} />)
      expect(screen.queryByText(/selected/)).not.toBeInTheDocument()
    })

    it('should show the bulk-action bar with count after selecting one row', async () => {
      const user = userEvent.setup()
      render(
        <BulkRequestTable
          {...defaultProps({
            requests: [makeRequest({ id: 'a', title: 'Alpha' })],
            statusActions: [{ label: 'Approve', targetStatus: 'APPROVED' }],
          })}
        />,
      )
      await user.click(screen.getByRole('checkbox', { name: /select alpha/i }))
      expect(screen.getByText('1 selected')).toBeInTheDocument()
    })

    it('should toggle all rows with the header checkbox', async () => {
      const user = userEvent.setup()
      render(
        <BulkRequestTable
          {...defaultProps({
            requests: [
              makeRequest({ id: 'a', title: 'Alpha' }),
              makeRequest({ id: 'b', title: 'Beta' }),
              makeRequest({ id: 'c', title: 'Gamma' }),
            ],
          })}
        />,
      )
      await user.click(screen.getByRole('checkbox', { name: /select all/i }))
      expect(screen.getByText('3 selected')).toBeInTheDocument()
      await user.click(screen.getByRole('checkbox', { name: /select all/i }))
      expect(screen.queryByText(/selected/)).not.toBeInTheDocument()
    })

    it('should clear the selection via the Clear button', async () => {
      const user = userEvent.setup()
      render(
        <BulkRequestTable
          {...defaultProps({
            requests: [makeRequest({ id: 'a', title: 'Alpha' })],
          })}
        />,
      )
      await user.click(screen.getByRole('checkbox', { name: /select alpha/i }))
      expect(screen.getByText('1 selected')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: /^clear$/i }))
      expect(screen.queryByText(/selected/)).not.toBeInTheDocument()
    })
  })

  describe('status actions', () => {
    it('should render one button per provided statusAction', async () => {
      const user = userEvent.setup()
      render(
        <BulkRequestTable
          {...defaultProps({
            requests: [makeRequest({ id: 'a', title: 'Alpha' })],
            statusActions: [
              { label: 'Approve', targetStatus: 'APPROVED' },
              { label: 'Reject', targetStatus: 'REJECTED' },
              { label: 'Defer', targetStatus: 'DEFERRED' },
            ],
          })}
        />,
      )
      await user.click(screen.getByRole('checkbox', { name: /select alpha/i }))
      expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /reject/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /defer/i })).toBeInTheDocument()
    })

    it('should call bulkUpdateStatus with selected IDs and the target status', async () => {
      bulkUpdateStatus.mockResolvedValue(undefined)
      const user = userEvent.setup()
      render(
        <BulkRequestTable
          {...defaultProps({
            requests: [
              makeRequest({ id: 'a', title: 'Alpha' }),
              makeRequest({ id: 'b', title: 'Beta' }),
            ],
            statusActions: [{ label: 'Approve', targetStatus: 'APPROVED' }],
          })}
        />,
      )
      await user.click(screen.getByRole('checkbox', { name: /select alpha/i }))
      await user.click(screen.getByRole('checkbox', { name: /select beta/i }))
      await user.click(screen.getByRole('button', { name: /approve/i }))
      expect(bulkUpdateStatus).toHaveBeenCalledWith(['a', 'b'], 'APPROVED')
    })

    it('should clear the selection after a successful status update', async () => {
      bulkUpdateStatus.mockResolvedValue(undefined)
      const user = userEvent.setup()
      render(
        <BulkRequestTable
          {...defaultProps({
            requests: [makeRequest({ id: 'a', title: 'Alpha' })],
            statusActions: [{ label: 'Approve', targetStatus: 'APPROVED' }],
          })}
        />,
      )
      await user.click(screen.getByRole('checkbox', { name: /select alpha/i }))
      await user.click(screen.getByRole('button', { name: /approve/i }))
      expect(screen.queryByText(/selected/)).not.toBeInTheDocument()
    })
  })

  describe('tag actions', () => {
    it('should expand a tag input when the Tags button is clicked', async () => {
      const user = userEvent.setup()
      render(
        <BulkRequestTable
          {...defaultProps({
            requests: [makeRequest({ id: 'a', title: 'Alpha' })],
          })}
        />,
      )
      await user.click(screen.getByRole('checkbox', { name: /select alpha/i }))
      await user.click(screen.getByRole('button', { name: /tags/i }))
      expect(screen.getByPlaceholderText(/tag1, tag2/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /apply/i })).toBeInTheDocument()
    })

    it('should call bulkAddTags with the parsed tag list', async () => {
      bulkAddTags.mockResolvedValue(undefined)
      const user = userEvent.setup()
      render(
        <BulkRequestTable
          {...defaultProps({
            requests: [makeRequest({ id: 'a', title: 'Alpha' })],
          })}
        />,
      )
      await user.click(screen.getByRole('checkbox', { name: /select alpha/i }))
      await user.click(screen.getByRole('button', { name: /tags/i }))
      await user.type(screen.getByPlaceholderText(/tag1, tag2/i), 'one, two, three')
      await user.click(screen.getByRole('button', { name: /apply/i }))
      expect(bulkAddTags).toHaveBeenCalledWith(['a'], ['one', 'two', 'three'])
    })

    it('should call bulkRemoveTags when mode is set to remove', async () => {
      bulkRemoveTags.mockResolvedValue(undefined)
      const user = userEvent.setup()
      render(
        <BulkRequestTable
          {...defaultProps({
            requests: [makeRequest({ id: 'a', title: 'Alpha' })],
          })}
        />,
      )
      await user.click(screen.getByRole('checkbox', { name: /select alpha/i }))
      await user.click(screen.getByRole('button', { name: /tags/i }))
      await user.selectOptions(screen.getByRole('combobox'), 'remove')
      await user.type(screen.getByPlaceholderText(/tag1, tag2/i), 'stale')
      await user.click(screen.getByRole('button', { name: /apply/i }))
      expect(bulkRemoveTags).toHaveBeenCalledWith(['a'], ['stale'])
      expect(bulkAddTags).not.toHaveBeenCalled()
    })

    it('should disable Apply when the tag input is empty or whitespace', async () => {
      const user = userEvent.setup()
      render(
        <BulkRequestTable
          {...defaultProps({
            requests: [makeRequest({ id: 'a', title: 'Alpha' })],
          })}
        />,
      )
      await user.click(screen.getByRole('checkbox', { name: /select alpha/i }))
      await user.click(screen.getByRole('button', { name: /tags/i }))
      expect(screen.getByRole('button', { name: /apply/i })).toBeDisabled()
      await user.type(screen.getByPlaceholderText(/tag1, tag2/i), '   ')
      expect(screen.getByRole('button', { name: /apply/i })).toBeDisabled()
    })

    it('should submit on Enter key in the tag input', async () => {
      bulkAddTags.mockResolvedValue(undefined)
      const user = userEvent.setup()
      render(
        <BulkRequestTable
          {...defaultProps({
            requests: [makeRequest({ id: 'a', title: 'Alpha' })],
          })}
        />,
      )
      await user.click(screen.getByRole('checkbox', { name: /select alpha/i }))
      await user.click(screen.getByRole('button', { name: /tags/i }))
      await user.type(screen.getByPlaceholderText(/tag1, tag2/i), 'urgent{Enter}')
      expect(bulkAddTags).toHaveBeenCalledWith(['a'], ['urgent'])
    })

    it('should not call any tag action if no rows are selected', async () => {
      const user = userEvent.setup()
      render(
        <BulkRequestTable
          {...defaultProps({
            requests: [makeRequest({ id: 'a', title: 'Alpha' })],
          })}
        />,
      )
      // Without selection, the bulk bar is hidden — verify no input exists
      expect(screen.queryByPlaceholderText(/tag1, tag2/i)).not.toBeInTheDocument()
      void user
      expect(bulkAddTags).not.toHaveBeenCalled()
      expect(bulkRemoveTags).not.toHaveBeenCalled()
    })
  })

  describe('vote summaries', () => {
    it('should pull vote data from the voteSummaries map by request id', () => {
      render(
        <BulkRequestTable
          {...defaultProps({
            requests: [
              makeRequest({ id: 'a', title: 'Alpha' }),
              makeRequest({ id: 'b', title: 'Beta' }),
            ],
            voteSummaries: [
              { requestId: 'a', averageScore: 4.5, voteCount: 8 },
              { requestId: 'b', averageScore: 2.0, voteCount: 3 },
            ],
          })}
        />,
      )
      // VoteBadge rendering specifics belong to its own test — we just
      // verify the table provides per-row data without crashing.
      const alphaRow = screen.getByText('Alpha').closest('tr')
      const betaRow = screen.getByText('Beta').closest('tr')
      expect(alphaRow).not.toBeNull()
      expect(betaRow).not.toBeNull()
      expect(within(alphaRow as HTMLElement).getByText(/8/)).toBeInTheDocument()
      expect(within(betaRow as HTMLElement).getByText(/3/)).toBeInTheDocument()
    })
  })
})
