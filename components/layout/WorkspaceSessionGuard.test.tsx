import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { WorkspaceSessionGuard } from './WorkspaceSessionGuard';

afterEach(() => vi.unstubAllGlobals());
describe('workspace session revalidation', () => {
  it('hides old workspace content while revalidating on focus, then restores a matching session', async () => {
    let resolve!: (value: Response) => void;
    vi.stubGlobal('fetch', () => new Promise<Response>(r => { resolve = r; }));
    render(<WorkspaceSessionGuard userId="user" orgId="org" role="ADMIN"><button>Admin operation</button></WorkspaceSessionGuard>);
    expect(screen.getByRole('button', { name: 'Admin operation' })).toBeVisible();
    fireEvent.focus(window);
    expect(screen.queryByRole('button', { name: 'Admin operation' })).not.toBeInTheDocument();
    await act(async () => resolve(Response.json({ user: { id: 'user', orgId: 'org', role: 'ADMIN' } })));
    expect(await screen.findByRole('button', { name: 'Admin operation' })).toBeVisible();
  });
  it('keeps content hidden and offers retry when authorization cannot be checked', async () => {
    vi.stubGlobal('fetch', async () => { throw new Error('Offline'); });
    render(<WorkspaceSessionGuard userId="user" orgId="org" role="ADMIN"><button>Admin operation</button></WorkspaceSessionGuard>);
    fireEvent.focus(window);
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to verify');
    expect(screen.queryByRole('button', { name: 'Admin operation' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeVisible();
  });
});
