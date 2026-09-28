import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ClientMessagesCard } from './ClientMessagesCard'
import { sendMessageToClient } from '@/app/(dashboard)/requests/[id]/client-message-actions'
vi.mock('@/app/(dashboard)/requests/[id]/client-message-actions', () => ({ sendMessageToClient: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const messages = [
  { id: 'm1', direction: 'TO_CLIENT' as const, body: 'Which page?', authorName: 'Rita Reviewer', createdAt: '2026-09-28T10:00:00.000Z' },
  { id: 'm2', direction: 'FROM_CLIENT' as const, body: 'The search page', authorName: 'Kari', createdAt: '2026-09-28T11:00:00.000Z' },
]

describe('ClientMessagesCard', () => {
  it('shows the thread and states who will see a new message before it is sent', async () => {
    const user = userEvent.setup()
    vi.mocked(sendMessageToClient).mockResolvedValue({ success: true })
    render(<ClientMessagesCard requestId="r1" messages={messages} audience="Kari at Nordic Homes" canSend />)
    expect(screen.getByText('Which page?')).toBeInTheDocument()
    expect(screen.getByText(/Rita Reviewer → client/)).toBeInTheDocument()
    expect(screen.getByText(/Kari → team/)).toBeInTheDocument()
    expect(screen.getByText('Visible to Kari at Nordic Homes')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Message to the client'), 'Thanks, fixing it')
    await user.click(screen.getByRole('button', { name: 'Send to client' }))
    expect(sendMessageToClient).toHaveBeenCalledWith('r1', 'Thanks, fixing it')
  })

  it('shows the thread read-only to stakeholders', () => {
    render(<ClientMessagesCard requestId="r1" messages={messages} audience="Kari at Nordic Homes" canSend={false} />)
    expect(screen.queryByLabelText('Message to the client')).not.toBeInTheDocument()
  })
})
