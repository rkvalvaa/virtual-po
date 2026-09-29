import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const mocks = vi.hoisted(() => ({ replay: vi.fn(), refresh: vi.fn() }))
vi.mock('@/app/(dashboard)/requests/[id]/change-workflow-actions', () => ({ replayChangeDelivery: mocks.replay }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }))

import { DeliveryPanel } from './DeliveryPanel'

const base = { url: null, error: null, attempts: 0, nextAttemptAt: null }

describe('DeliveryPanel', () => {
  beforeEach(() => { mocks.replay.mockReset().mockResolvedValue({}); mocks.refresh.mockReset() })

  it('links to the delivered Linear issue', () => {
    render(<DeliveryPanel requestId="r1" canReplay delivery={{ ...base, status: 'DELIVERED', url: 'https://linear.app/acme/issue/OPS-1', attempts: 1 }} />)
    expect(screen.getByText('Delivered to Linear')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open in Linear' })).toHaveAttribute('href', 'https://linear.app/acme/issue/OPS-1')
    expect(screen.queryByRole('button', { name: 'Replay delivery' })).not.toBeInTheDocument()
  })

  it('shows a queued retry with its last error', () => {
    render(<DeliveryPanel requestId="r1" canReplay delivery={{ ...base, status: 'QUEUED', attempts: 2, error: 'Rate limited', nextAttemptAt: '2026-09-29T08:00:00Z' }} />)
    expect(screen.getByText(/Queued for Linear/)).toBeInTheDocument()
    expect(screen.getByText(/Rate limited/)).toBeInTheDocument()
  })

  it('lets a reviewer replay a delivery that needs attention', async () => {
    const user = userEvent.setup()
    render(<DeliveryPanel requestId="r1" canReplay delivery={{ ...base, status: 'NEEDS_ATTENTION', attempts: 1, error: 'Linear API error 403' }} />)
    expect(screen.getByText('Needs attention')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Replay delivery' }))
    expect(mocks.replay).toHaveBeenCalledWith('r1')
    expect(mocks.refresh).toHaveBeenCalled()
  })

  it('hides replay from members who cannot use it, and shows a refused replay', async () => {
    const { unmount } = render(<DeliveryPanel requestId="r1" canReplay={false} delivery={{ ...base, status: 'FAILED', attempts: 5, error: 'timeout' }} />)
    expect(screen.getByText('Failed after 5 attempts')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Replay delivery' })).not.toBeInTheDocument()
    unmount()
    const user = userEvent.setup()
    mocks.replay.mockResolvedValue({ error: 'There is no failed delivery to replay.' })
    render(<DeliveryPanel requestId="r1" canReplay delivery={{ ...base, status: 'FAILED', attempts: 5, error: 'timeout' }} />)
    await user.click(screen.getByRole('button', { name: 'Replay delivery' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('no failed delivery')
  })
})
