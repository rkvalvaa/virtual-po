import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TeamsSettings } from './TeamsSettings'

vi.mock('@/app/(dashboard)/settings/teams-actions', () => ({
  connectTeams: vi.fn(), disconnectTeams: vi.fn(), testTeamsConnection: vi.fn(), addTeamsNotificationConfig: vi.fn(),
  removeTeamsNotificationConfig: vi.fn(), bindTeamsIdentityAction: vi.fn(), retryTeamsDeliveryAction: vi.fn(),
}))

describe('Teams settings', () => {
  it('shows capability validation truth and delivery state without exposing webhook credentials', () => {
    render(<TeamsSettings userRole="ADMIN" integration={{ id: 'integration', isActive: true, connectedAt: '2026-09-09T09:00:00Z' }}
      notifications={[]} tenantId="tenant-id" members={[]}
      readiness={{ notifications: 'NOT_VALIDATED', commands: 'NOT_CONFIGURED', approvals: 'UNSUPPORTED', message: 'Deployment validation is incomplete.' }}
      deliveries={[{ id: 'delivery', channelName: 'Product', eventType: 'STATUS_CHANGED', status: 'RECONCILIATION_REQUIRED', attemptCount: 1, errorMessage: 'Provider outcome unknown.', createdAt: '2026-09-09T09:00:00Z' }]} />)
    for (const label of ['Notifications: not validated', 'Commands: not configured', 'Approvals: unavailable']) {
      expect(screen.getByText(label)).toHaveClass('max-w-full', 'whitespace-normal')
    }
    expect(screen.getByText('reconciliation required')).toBeInTheDocument()
    expect(screen.getByText('Provider outcome unknown.')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('webhook.office.com')
  })
})
