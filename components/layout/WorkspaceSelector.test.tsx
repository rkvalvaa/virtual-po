import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorkspaceSelector } from './WorkspaceSelector';

const action = vi.hoisted(() => ({ switchWorkspace: vi.fn() }));
vi.mock('@/app/(dashboard)/workspace-actions', () => action);

const workspaces = [
  { id: 'workspace-a', name: 'Engineering', role: 'ADMIN' as const },
  { id: 'workspace-b', name: 'Research', role: 'STAKEHOLDER' as const },
];

describe('workspace selection', () => {
  beforeEach(() => { action.switchWorkspace.mockReset(); vi.spyOn(window, 'confirm').mockReturnValue(true); });
  it('cancels before changing the session when the user wants to keep edits', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<WorkspaceSelector activeOrgId="workspace-a" workspaces={workspaces} />);
    await userEvent.selectOptions(screen.getByRole('combobox'), 'workspace-b');
    expect(action.switchWorkspace).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox')).toHaveValue('workspace-a');
  });
  it('labels the active workspace and lists the supplied memberships with their roles', () => {
    render(<WorkspaceSelector activeOrgId="workspace-b" workspaces={workspaces} />);
    expect(screen.getByRole('combobox', { name: 'Workspace' })).toHaveValue('workspace-b');
    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(screen.getByRole('option', { name: /Research.*Stakeholder/ })).toBeInTheDocument();
  });

  it('retains the current selection and explains a rejected switch', async () => {
    action.switchWorkspace.mockResolvedValue({ success: false, error: 'Membership no longer available.' });
    render(<WorkspaceSelector activeOrgId="workspace-a" workspaces={workspaces} />);
    await userEvent.selectOptions(screen.getByRole('combobox'), 'workspace-b');
    expect(await screen.findByRole('alert')).toHaveTextContent('Membership no longer available.');
    expect(screen.getByRole('combobox')).toHaveValue('workspace-a');
  });

  it('prevents another switch while the server is resolving membership', async () => {
    let resolve!: (value: { success: boolean; error: string }) => void;
    action.switchWorkspace.mockReturnValue(new Promise(r => { resolve = r; }));
    render(<WorkspaceSelector activeOrgId="workspace-a" workspaces={workspaces} />);
    await userEvent.selectOptions(screen.getByRole('combobox'), 'workspace-b');
    expect(screen.getByRole('combobox')).toBeDisabled();
    resolve({ success: false, error: 'Try again.' });
    await waitFor(() => expect(screen.getByRole('combobox')).toBeEnabled());
  });
});
