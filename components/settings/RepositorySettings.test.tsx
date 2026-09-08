import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RepositorySettings } from './RepositorySettings';
vi.mock('@/app/(dashboard)/settings/actions', () => ({
  fetchAvailableRepos: vi.fn(async () => ({ repos: [{ id: 42, owner: 'verified', name: 'new', fullName: 'verified/new', defaultBranch: 'main' }] })),
  connectRepo: vi.fn(async () => ({ success: false, error: 'Provider denied connection' })),
  disconnectRepo: vi.fn(async () => ({ success: false, error: 'Repository no longer available' })),
}));
const repositories = [{ id: 'repo-id', fullName: 'verified/repo', owner: 'verified', name: 'repo', defaultBranch: 'main', connectedAt: '2026-01-01' }];
describe('repository settings permissions and feedback', () => {
  it.each(['STAKEHOLDER', 'REVIEWER'])('renders %s connections read-only', role => {
    render(<RepositorySettings repositories={repositories} userRole={role} />);
    expect(screen.getByText('verified/repo')).toBeVisible();
    expect(screen.queryByRole('button', { name: /connect/i })).not.toBeInTheDocument();
  });
  it('shows connect and disconnect errors to admins', async () => {
    const user = userEvent.setup();
    render(<RepositorySettings repositories={repositories} userRole="ADMIN" />);
    await user.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Repository no longer available');
    await user.click(screen.getByRole('button', { name: 'Connect Repository' }));
    await user.click(await screen.findByRole('button', { name: 'Connect' }));
    expect(await screen.findByText('Provider denied connection')).toBeVisible();
  });
});
