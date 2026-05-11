import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Pagination } from './Pagination'

const mockPush = vi.fn()
let mockSearchParams = new URLSearchParams()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/requests',
  useSearchParams: () => mockSearchParams,
}))

function setSearchParams(qs: string) {
  mockSearchParams = new URLSearchParams(qs)
}

beforeEach(() => {
  mockPush.mockReset()
  setSearchParams('')
})

describe('Pagination', () => {
  describe('rendering', () => {
    it('should render nothing when total fits in one page', () => {
      const { container } = render(<Pagination total={10} limit={25} offset={0} />)
      expect(container.firstChild).toBeNull()
    })

    it('should render nothing when total equals limit', () => {
      const { container } = render(<Pagination total={25} limit={25} offset={0} />)
      expect(container.firstChild).toBeNull()
    })

    it('should render controls when total exceeds limit', () => {
      render(<Pagination total={100} limit={25} offset={0} />)
      expect(screen.getByRole('button', { name: /previous page/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /next page/i })).toBeInTheDocument()
    })

    it('should show the "Showing X–Y of N" range on the first page', () => {
      render(<Pagination total={100} limit={25} offset={0} />)
      const range = screen.getByText(/showing/i).parentElement
      expect(range?.textContent).toMatch(/Showing\s*1\s*–\s*25\s*of\s*100/)
    })

    it('should clamp the last-row indicator to total on the final partial page', () => {
      render(<Pagination total={110} limit={25} offset={100} />)
      const range = screen.getByText(/showing/i).parentElement
      expect(range?.textContent).toMatch(/Showing\s*101\s*–\s*110\s*of\s*110/)
    })

    it('should show "Page X of Y" in the indicator', () => {
      render(<Pagination total={100} limit={25} offset={50} />)
      expect(screen.getByText(/page 3 of 4/i)).toBeInTheDocument()
    })
  })

  describe('button enabled state', () => {
    it('should disable Prev on the first page', () => {
      render(<Pagination total={100} limit={25} offset={0} />)
      expect(screen.getByRole('button', { name: /previous page/i })).toBeDisabled()
      expect(screen.getByRole('button', { name: /next page/i })).toBeEnabled()
    })

    it('should disable Next on the last page', () => {
      render(<Pagination total={100} limit={25} offset={75} />)
      expect(screen.getByRole('button', { name: /next page/i })).toBeDisabled()
      expect(screen.getByRole('button', { name: /previous page/i })).toBeEnabled()
    })

    it('should enable both in the middle', () => {
      render(<Pagination total={100} limit={25} offset={25} />)
      expect(screen.getByRole('button', { name: /previous page/i })).toBeEnabled()
      expect(screen.getByRole('button', { name: /next page/i })).toBeEnabled()
    })
  })

  describe('navigation', () => {
    it('should push the next offset on Next click', async () => {
      const user = userEvent.setup()
      render(<Pagination total={100} limit={25} offset={0} />)
      await user.click(screen.getByRole('button', { name: /next page/i }))
      expect(mockPush).toHaveBeenCalledWith('/requests?offset=25')
    })

    it('should push the previous offset on Prev click', async () => {
      const user = userEvent.setup()
      render(<Pagination total={100} limit={25} offset={50} />)
      await user.click(screen.getByRole('button', { name: /previous page/i }))
      expect(mockPush).toHaveBeenCalledWith('/requests?offset=25')
    })

    it('should strip the offset param entirely when returning to page 1', async () => {
      const user = userEvent.setup()
      render(<Pagination total={100} limit={25} offset={25} />)
      await user.click(screen.getByRole('button', { name: /previous page/i }))
      expect(mockPush).toHaveBeenCalledWith('/requests')
    })

    it('should preserve other query params when navigating', async () => {
      setSearchParams('status=UNDER_REVIEW&search=dark')
      const user = userEvent.setup()
      render(<Pagination total={100} limit={25} offset={0} />)
      await user.click(screen.getByRole('button', { name: /next page/i }))
      const pushed = mockPush.mock.calls[0][0] as string
      expect(pushed).toContain('status=UNDER_REVIEW')
      expect(pushed).toContain('search=dark')
      expect(pushed).toContain('offset=25')
    })
  })
})
