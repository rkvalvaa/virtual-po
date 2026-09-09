import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SetupChecklist } from './SetupChecklist';
import type { SetupCapability, WorkspaceSetup } from '@/lib/db/queries/setup';

const actions = vi.hoisted(() => ({ setSetupChecklistDismissed: vi.fn() }));
vi.mock('@/app/(dashboard)/requests/setup-actions', () => actions);

const setup: WorkspaceSetup = {
  orgId: 'org',
  role: 'ADMIN',
  dismissed: false,
  items: {
    workspaceNamed: true,
    collaboratorsAdded: false,
    contextAdded: false,
    firstRequestCreated: true,
  },
};

const capabilities: SetupCapability[] = [
  { key: 'email', label: 'Email delivery', state: 'READY', message: 'Ready for testing.', optional: true, adminOnly: false, href: '/settings#email' },
  { key: 'jira', label: 'Jira', state: 'NOT_CONFIGURED', message: 'Connect if needed.', optional: true, adminOnly: true, href: '/settings#jira' },
  { key: 'linear', label: 'Linear', state: 'READY', message: 'Connected.', optional: true, adminOnly: true, href: '/settings#linear' },
  { key: 'github_issues', label: 'GitHub Issues', state: 'NOT_CONFIGURED', message: 'Connect if needed.', optional: true, adminOnly: true, href: '/settings#github-issues' },
  { key: 'slack', label: 'Slack notifications', state: 'ERROR', message: 'Readiness unavailable.', optional: true, adminOnly: true, href: '/settings#slack' },
  { key: 'teams_notifications', label: 'Teams notifications', state: 'READY', message: 'Validated.', optional: true, adminOnly: true, href: '/settings#teams' },
  { key: 'teams_commands', label: 'Teams commands', state: 'NOT_CONFIGURED', message: 'Configure a binding.', optional: true, adminOnly: true, href: '/settings#teams' },
  { key: 'teams_approvals', label: 'Teams approvals', state: 'UNSUPPORTED', message: 'Not included.', optional: true, adminOnly: false, href: null },
];

describe('workspace setup checklist', () => {
  beforeEach(() => actions.setSetupChecklistDismissed.mockReset());

  it('shows derived progress, direct admin settings links, and optional readiness states', () => {
    render(<SetupChecklist setup={setup} capabilities={capabilities} />);
    expect(screen.getByText('2 of 4 complete')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open member settings' })).toHaveAttribute('href', '/settings#members');
    expect(screen.getByRole('link', { name: 'Open repository settings' })).toHaveAttribute('href', '/settings#repositories');
    expect(screen.getByRole('link', { name: 'Open OKR settings' })).toHaveAttribute('href', '/settings#okrs');
    expect(screen.getByRole('link', { name: 'Open Jira settings' })).toHaveAttribute('href', '/settings#jira');
    expect(screen.getByRole('link', { name: 'Open Linear settings' })).toHaveAttribute('href', '/settings#linear');
    expect(screen.getByRole('link', { name: 'Open GitHub Issues settings' })).toHaveAttribute('href', '/settings#github-issues');
    expect(screen.getByRole('link', { name: 'Create a request' })).toHaveAttribute('href', '/requests/new');
    expect(screen.getAllByText('Ready').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Not configured').length).toBeGreaterThan(0);
    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText('Unsupported')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Optional capabilities' })).toBeInTheDocument();
  });

  it('does not offer administrator actions to a stakeholder', () => {
    render(<SetupChecklist setup={{ ...setup, role: 'STAKEHOLDER' }} capabilities={capabilities} />);
    expect(screen.queryByRole('link', { name: /member settings/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /repository settings/i })).not.toBeInTheDocument();
    expect(screen.getAllByText(/ask a workspace administrator/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Create a request' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Email delivery settings' })).toHaveAttribute('href', '/settings#email');
    expect(screen.queryByRole('link', { name: 'Open Linear settings' })).not.toBeInTheDocument();
  });

  it('announces each item completion state without relying on its icon', () => {
    render(<SetupChecklist setup={setup} capabilities={capabilities} />);
    const named = screen.getByText('Name your workspace').closest('li');
    const collaborators = screen.getByText('Invite a teammate').closest('li');
    expect(named).not.toBeNull();
    expect(collaborators).not.toBeNull();
    expect(within(named!).getByText('Complete')).toBeInTheDocument();
    expect(within(collaborators!).getByText('Not complete')).toBeInTheDocument();
  });

  it('dismisses and resumes without losing derived completion', async () => {
    const user = userEvent.setup();
    actions.setSetupChecklistDismissed.mockResolvedValue({ success: true });
    render(<SetupChecklist setup={setup} capabilities={capabilities} />);
    await user.click(screen.getByRole('button', { name: 'Dismiss setup checklist' }));
    expect(await screen.findByText('Setup checklist is hidden.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Resume setup checklist' }));
    expect(await screen.findByText('2 of 4 complete')).toBeInTheDocument();
  });

  it('keeps the checklist visible when persistence fails', async () => {
    const user = userEvent.setup();
    actions.setSetupChecklistDismissed.mockResolvedValue({ success: false, error: 'Membership changed.' });
    render(<SetupChecklist setup={setup} capabilities={capabilities} />);
    await user.click(screen.getByRole('button', { name: 'Dismiss setup checklist' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Membership changed.');
    expect(screen.getByText('2 of 4 complete')).toBeInTheDocument();
  });
});
