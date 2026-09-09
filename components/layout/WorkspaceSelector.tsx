"use client";

import { useId, useState, useTransition } from 'react';
import { switchWorkspace } from '@/app/(dashboard)/workspace-actions';
import type { UserRole } from '@/lib/types/database';
import { WORKSPACE_CHANGED_KEY } from '@/lib/auth/workspace-events';

export interface WorkspaceOption { id: string; name: string; role: UserRole }
const roleNames: Record<UserRole, string> = { ADMIN: 'Admin', REVIEWER: 'Reviewer', STAKEHOLDER: 'Stakeholder' };

export function WorkspaceSelector({ activeOrgId, workspaces }: {
  activeOrgId: string;
  workspaces: WorkspaceOption[];
}) {
  const id = useId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  return <div className="min-w-0 px-6 pb-4">
    <label htmlFor={id} className="mb-1 block text-xs font-medium text-muted-foreground">Workspace</label>
    <select id={id} value={activeOrgId} disabled={pending || workspaces.length < 2}
      title={workspaces.find(w => w.id === activeOrgId)?.name}
      aria-describedby={`${id}-hint`}
      className="h-10 w-full min-w-0 rounded-md border bg-background px-2 text-sm disabled:opacity-70"
      onChange={event => {
        const target = event.target.value;
        if (target === activeOrgId) return;
        // Confirm before touching the shared auth cookie. A canceled unload
        // after updateSession would leave old content under new authority.
        if (!window.confirm('Switch workspace? Unsaved edits on this page will be lost.')) return;
        setError('');
        startTransition(async () => {
          try {
            const result = await switchWorkspace(target);
            if (!result.success) { setError(result.error ?? 'Unable to switch workspace.'); return; }
            // This is a signal, never an authorization source. Other tabs
            // revalidate the server session before using a new workspace.
            try { localStorage.setItem(WORKSPACE_CHANGED_KEY, `${Date.now()}:${target}`); } catch { /* Storage may be disabled. Focus revalidation remains available. */ }
            // A workspace change must discard the router cache and all local state.
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination
            window.location.assign('/requests');
          } catch { setError('Unable to switch workspace. Please try again.'); }
        });
      }}>
      {workspaces.map(workspace => <option key={workspace.id} value={workspace.id}>
        {workspace.name} · {roleNames[workspace.role]}
      </option>)}
    </select>
    <p id={`${id}-hint`} className="mt-1 text-xs text-muted-foreground">
      {pending ? 'Switching workspace…' : workspaces.length > 1 ? 'Save your edits before switching.' : 'Your active workspace.'}
    </p>
    {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
  </div>;
}
