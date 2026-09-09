import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InvitationSettings } from './InvitationSettings';
import { manageInvitation } from '@/app/(dashboard)/settings/invitation-actions';
vi.mock('@/app/(dashboard)/settings/invitation-actions', () => ({ manageInvitation: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
describe('invitations settings', () => {
  it('shows delivery failures and permits resending pending invitations', async () => {
    const user = userEvent.setup();
    render(<InvitationSettings invitations={[{ id: 'invite', email: 'user@example.test', role: 'REVIEWER', expiresAt: '2099-01-01', deliveryStatus: 'FAILED', deliveryError: 'Sender unverified' }]} readiness={null} />);
    expect(screen.getByText('Sender unverified')).toBeInTheDocument();
    vi.mocked(manageInvitation).mockResolvedValue({ success: false, error: 'Delivery failed' });
    await user.click(screen.getByRole('button', { name: /Resend/ }));
    expect(manageInvitation).toHaveBeenCalledWith({ kind: 'resend', id: 'invite' });
    expect(await screen.findByRole('alert')).toHaveTextContent('Delivery failed');
  });
  it('shows missing setup and disables sending', () => {
    render(<InvitationSettings invitations={[]} readiness="Configure email delivery" />);
    expect(screen.getByText('Configure email delivery')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send invitation' })).toBeDisabled();
  });
  it('labels provider acceptance without claiming inbox delivery', () => {
    render(<InvitationSettings invitations={[{ id: 'invite', email: 'user@example.test', role: 'REVIEWER', expiresAt: '2099-01-01', deliveryStatus: 'SENT', deliveryError: null }]} readiness={null} />);
    expect(screen.getByText(/Accepted by email provider/)).toBeVisible();
    expect(screen.getByText(/does not confirm inbox delivery/)).toBeVisible();
    expect(screen.queryByText('Email sent')).not.toBeInTheDocument();
  });
});
