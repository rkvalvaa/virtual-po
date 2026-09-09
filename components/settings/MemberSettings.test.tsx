import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemberSettings } from './MemberSettings';
import { updateMember } from '@/app/(dashboard)/settings/organization-actions';
vi.mock('@/app/(dashboard)/settings/organization-actions', () => ({ updateMember: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const members = [{ userId: 'self', userName: 'Admin', userEmail: 'admin@example.test', role: 'ADMIN', joinedAt: '2026-01-01' }, { userId: 'other', userName: 'Reviewer', userEmail: 'reviewer@example.test', role: 'REVIEWER', joinedAt: '2026-01-01' }];
describe('member management', () => {
  it('requires confirmation and permits cancellation before removing a member', async () => {
    const user = userEvent.setup();
    render(<MemberSettings members={members} currentUserId="self" userRole="ADMIN" />);
    await user.click(screen.getByRole('button', { name: 'Remove Reviewer' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('unassigned');
    expect(updateMember).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove Reviewer' }));
    vi.mocked(updateMember).mockResolvedValue({ success: true });
    await user.click(screen.getByRole('button', { name: 'Confirm change' }));
    expect(updateMember).toHaveBeenCalledWith('other', { kind: 'remove' });
    expect(await screen.findByRole('status')).toHaveTextContent('Membership updated');
  });
  it('does not expose mutation controls to reviewers', () => {
    render(<MemberSettings members={members} currentUserId="other" userRole="REVIEWER" />);
    expect(screen.queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});
