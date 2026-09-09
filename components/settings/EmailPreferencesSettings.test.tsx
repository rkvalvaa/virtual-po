import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EmailPreferencesSettings } from './EmailPreferencesSettings'
import { retryEmailDeliveryAction, sendEmailTestAction } from '@/app/(dashboard)/settings/email-actions'
import { NOTIFICATION_TYPES } from '@/lib/types/database'

vi.mock('@/app/(dashboard)/settings/email-actions', () => ({
  toggleEmailPreference: vi.fn(),
  sendEmailTestAction: vi.fn(async () => ({ success: true, status: 'ACCEPTED' })),
  retryEmailDeliveryAction: vi.fn(async () => ({ success: true })),
}))

const preferences = Object.fromEntries(NOTIFICATION_TYPES.map(type => [type, true])) as Record<(typeof NOTIFICATION_TYPES)[number], boolean>

describe('email settings', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows configured metadata and calls the admin test path without claiming delivery', async () => {
    const user = userEvent.setup()
    render(<EmailPreferencesSettings preferences={preferences} userRole="ADMIN"
      readiness={{ state: 'CONFIGURED', provider: 'Resend', sender: 'VPO <sender@example.test>', applicationUrl: 'https://vpo.example.test', message: 'Email is configured. Use the test below to verify provider acceptance.' }}
      deliveries={[]} />)
    expect(screen.getByText('Configured')).toBeVisible()
    expect(screen.getByText(/sender@example.test/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Send test to me' }))
    expect(sendEmailTestAction).toHaveBeenCalled()
    expect(await screen.findByRole('status')).toHaveTextContent('accepted by the provider')
    expect(screen.getByRole('status')).toHaveTextContent('inbox delivery is not confirmed')
  })

  it('shows unavailable feedback and disables testing', () => {
    render(<EmailPreferencesSettings preferences={preferences} userRole="ADMIN"
      readiness={{ state: 'UNAVAILABLE', provider: 'Resend', sender: null, applicationUrl: null, message: 'Email is unavailable. Configure RESEND_API_KEY, EMAIL_FROM, APP_URL.' }}
      deliveries={[]} />)
    expect(screen.getByText('Unavailable')).toBeVisible()
    expect(screen.getByText(/Configure RESEND_API_KEY/)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Send test to me' })).toBeDisabled()
  })

  it('renders visible statuses and retries only failed delivery rows', async () => {
    const user = userEvent.setup()
    render(<EmailPreferencesSettings preferences={preferences} userRole="ADMIN"
      readiness={{ state: 'CONFIGURED', provider: 'Resend', sender: 'sender@example.test', applicationUrl: 'https://vpo.example.test', message: 'Configured' }}
      deliveries={[
        { id: 'failed', kind: 'TEST', recipientEmail: 'admin@example.test', status: 'FAILED', attemptCount: 5, providerMessageId: null, errorCode: 'validation_error', errorMessage: 'Sender rejected', acceptedAt: null, deliveredAt: null, createdAt: '2026-09-09T10:00:00Z' },
        { id: 'accepted', kind: 'NOTIFICATION', recipientEmail: 'user@example.test', status: 'ACCEPTED', attemptCount: 1, providerMessageId: 'provider-1', errorCode: null, errorMessage: null, acceptedAt: '2026-09-09T10:00:00Z', deliveredAt: null, createdAt: '2026-09-09T10:00:00Z' },
      ]} />)
    expect(screen.getByText('Failed')).toBeVisible()
    expect(screen.getByText('Accepted by provider')).toBeVisible()
    expect(screen.getAllByText(/does not confirm inbox delivery/)).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: 'Retry failed email' }))
    expect(retryEmailDeliveryAction).toHaveBeenCalledWith('failed')
  })

  it('does not expose delivery administration to non-admins', () => {
    render(<EmailPreferencesSettings preferences={preferences} userRole="STAKEHOLDER"
      readiness={{ state: 'CONFIGURED', provider: 'Resend', sender: 'sender@example.test', applicationUrl: 'https://vpo.example.test', message: 'Configured' }}
      deliveries={[]} />)
    expect(screen.queryByRole('button', { name: 'Send test to me' })).not.toBeInTheDocument()
    expect(screen.queryByText('Delivery readiness')).not.toBeInTheDocument()
  })
})
