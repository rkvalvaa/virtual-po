import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PortalReply } from './PortalReply'

describe('PortalReply', () => {
  it('sends the reply and clears the box', async () => {
    const user = userEvent.setup()
    const reply = vi.fn(async () => ({ status: 'sent' as const }))
    render(<PortalReply reply={reply} />)
    await user.type(screen.getByLabelText('Your reply'), 'The search page')
    await user.click(screen.getByRole('button', { name: 'Send reply' }))
    expect(((reply.mock.calls[0] as unknown[])[1] as FormData).get('body')).toBe('The search page')
    expect(await screen.findByLabelText('Your reply')).toHaveValue('')
  })

  it('shows why a reply was refused', async () => {
    const user = userEvent.setup()
    const reply = vi.fn(async () => ({ status: 'error' as const, message: 'Write a message of 1 to 5000 characters.' }))
    render(<PortalReply reply={reply} />)
    await user.type(screen.getByLabelText('Your reply'), ' ')
    await user.click(screen.getByRole('button', { name: 'Send reply' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('1 to 5000 characters')
  })
})
