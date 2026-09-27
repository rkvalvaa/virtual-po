import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ClientSettings } from './ClientSettings'
import { manageClients } from '@/app/(dashboard)/settings/client-actions'
vi.mock('@/app/(dashboard)/settings/client-actions', () => ({ manageClients: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const accounts = [{
  id: 'acct-1',
  name: 'Nordic Homes',
  contacts: [
    { id: 'contact-1', email: 'kari@nordic.example', name: 'Kari Nordmann', revokedAt: null },
    { id: 'contact-2', email: 'ola@nordic.example', name: null, revokedAt: '2026-09-01T00:00:00.000Z' },
  ],
}]

describe('client settings', () => {
  it('creates a client account', async () => {
    const user = userEvent.setup()
    vi.mocked(manageClients).mockResolvedValue({ success: true })
    render(<ClientSettings accounts={[]} />)
    await user.type(screen.getByLabelText('Client name'), 'Nordic Homes')
    await user.click(screen.getByRole('button', { name: 'Add client' }))
    expect(manageClients).toHaveBeenCalledWith({ kind: 'createAccount', name: 'Nordic Homes' })
  })

  it('adds a contact to an account and shows a refusal', async () => {
    const user = userEvent.setup()
    vi.mocked(manageClients).mockResolvedValue({ success: false, error: 'kari@nordic.example is already a contact.' })
    render(<ClientSettings accounts={accounts} />)
    await user.type(screen.getByLabelText('Contact email for Nordic Homes'), 'kari@nordic.example')
    await user.click(screen.getByRole('button', { name: 'Add contact to Nordic Homes' }))
    expect(manageClients).toHaveBeenCalledWith({ kind: 'addContact', accountId: 'acct-1', email: 'kari@nordic.example', name: '' })
    expect(await screen.findByRole('alert')).toHaveTextContent('already a contact')
  })

  it('revokes an active contact and marks revoked ones without a revoke button', async () => {
    const user = userEvent.setup()
    vi.mocked(manageClients).mockResolvedValue({ success: true })
    render(<ClientSettings accounts={accounts} />)
    expect(screen.getByText(/ola@nordic.example · revoked/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Revoke ola@nordic.example' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Revoke kari@nordic.example' }))
    expect(manageClients).toHaveBeenCalledWith({ kind: 'revokeContact', id: 'contact-1' })
  })
})
