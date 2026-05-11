import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SearchFilterBar } from './SearchFilterBar'

const mockPush = vi.fn()
let mockSearchParams = new URLSearchParams()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => mockSearchParams,
  usePathname: () => '/requests',
}))

function setSearchParams(qs: string) {
  mockSearchParams = new URLSearchParams(qs)
}

describe('SearchFilterBar', () => {
  beforeEach(() => {
    mockPush.mockReset()
    setSearchParams('')
  })

  describe('initial rendering from search params', () => {
    it('should pre-fill the search input from ?search=', () => {
      setSearchParams('search=dark+mode')
      render(<SearchFilterBar />)
      expect(screen.getByPlaceholderText(/search requests/i)).toHaveValue('dark mode')
    })

    it('should default to an empty search input when no ?search is present', () => {
      render(<SearchFilterBar />)
      expect(screen.getByPlaceholderText(/search requests/i)).toHaveValue('')
    })

    it('should show no active-filter badge or pills when there are no filters', () => {
      render(<SearchFilterBar />)
      expect(screen.queryByText(/active/)).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /clear all/i })).not.toBeInTheDocument()
    })

    it('should show the active count when filters are present in the URL', () => {
      setSearchParams('status=UNDER_REVIEW&complexity=M')
      render(<SearchFilterBar />)
      expect(screen.getByText(/2 active/)).toBeInTheDocument()
    })

    it('should include searchValue in the active count when also present', () => {
      setSearchParams('search=foo&status=UNDER_REVIEW')
      render(<SearchFilterBar />)
      expect(screen.getByText(/2 active/)).toBeInTheDocument()
    })

    it('should show status pills for selected statuses', () => {
      setSearchParams('status=UNDER_REVIEW&status=APPROVED')
      render(<SearchFilterBar />)
      // Labels come from STATUS_LABELS map
      const pills = screen.getAllByText(/Under Review|Approved/)
      expect(pills.length).toBeGreaterThanOrEqual(2)
    })

    it('should show complexity pills for selected complexities', () => {
      setSearchParams('complexity=S&complexity=L')
      render(<SearchFilterBar />)
      expect(screen.getByText('Small')).toBeInTheDocument()
      expect(screen.getByText('Large')).toBeInTheDocument()
    })
  })

  describe('debounced search', () => {
    it('should not call router.push synchronously when typing starts', async () => {
      const user = userEvent.setup()
      render(<SearchFilterBar />)
      const input = screen.getByPlaceholderText(/search requests/i)
      await user.type(input, 'h')
      // Synchronous assertion: no push has fired in the same tick.
      expect(mockPush).not.toHaveBeenCalled()
    })

    it('should call router.push with the search query after debounce', async () => {
      const user = userEvent.setup()
      render(<SearchFilterBar />)
      await user.type(screen.getByPlaceholderText(/search requests/i), 'hello')
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalled()
      })
      expect(mockPush.mock.calls.at(-1)?.[0]).toContain('search=hello')
    })

    it('should debounce so fast typing results in a single push', async () => {
      const user = userEvent.setup()
      render(<SearchFilterBar />)
      await user.type(screen.getByPlaceholderText(/search requests/i), 'abc')
      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledTimes(1)
      })
    })

    it('should clear the search by clicking the X button next to the input', async () => {
      setSearchParams('search=existing')
      const user = userEvent.setup()
      render(<SearchFilterBar />)
      const input = screen.getByPlaceholderText(/search requests/i)
      expect(input).toHaveValue('existing')
      const xButton = input.parentElement?.querySelector('button')
      expect(xButton).not.toBeNull()
      await user.click(xButton as HTMLElement)
      expect(input).toHaveValue('')
    })
  })

  describe('clear-all behavior', () => {
    it('should push the bare pathname when Clear all is clicked', async () => {
      setSearchParams('search=foo&status=UNDER_REVIEW')
      const user = userEvent.setup()
      render(<SearchFilterBar />)
      await user.click(screen.getByRole('button', { name: /clear all/i }))
      expect(mockPush).toHaveBeenCalledWith('/requests')
    })
  })

  describe('status filter popover', () => {
    it('should open the popover and reveal status checkboxes', async () => {
      const user = userEvent.setup()
      render(<SearchFilterBar />)
      await user.click(screen.getByRole('button', { name: /^status/i }))
      // Radix portals the content to document.body; query by status label.
      expect(await screen.findByText('Under Review')).toBeInTheDocument()
      expect(screen.getByText('Approved')).toBeInTheDocument()
    })

    it('should call router.push with the selected status when a checkbox is clicked', async () => {
      const user = userEvent.setup()
      render(<SearchFilterBar />)
      await user.click(screen.getByRole('button', { name: /^status/i }))

      const item = await screen.findByText('Under Review')
      await user.click(item)
      expect(mockPush).toHaveBeenCalledTimes(1)
      expect(mockPush.mock.calls[0][0]).toContain('status=UNDER_REVIEW')
    })

    it('should show a badge with the selected count on the status trigger', () => {
      setSearchParams('status=UNDER_REVIEW&status=APPROVED&status=REJECTED')
      render(<SearchFilterBar />)
      const statusButton = screen.getByRole('button', { name: /^status/i })
      expect(statusButton.textContent).toContain('3')
    })
  })

  describe('removing a filter via its pill', () => {
    it('should call router.push without the removed status when its pill is clicked', async () => {
      setSearchParams('status=UNDER_REVIEW&status=APPROVED')
      const user = userEvent.setup()
      render(<SearchFilterBar />)
      // The pills render the status label and an X. Clicking the pill
      // (the badge) toggles that status off.
      const pill = screen.getByText('Approved').closest('[class*="cursor-pointer"]')
      expect(pill).not.toBeNull()
      await user.click(pill as HTMLElement)
      expect(mockPush).toHaveBeenCalledTimes(1)
      // The remaining status should still be present, but APPROVED should not.
      const calledUrl = mockPush.mock.calls[0][0] as string
      expect(calledUrl).toContain('status=UNDER_REVIEW')
      expect(calledUrl).not.toContain('status=APPROVED')
    })
  })
})
