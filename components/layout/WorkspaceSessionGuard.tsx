"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import type { UserRole } from '@/lib/types/database';
import { WORKSPACE_CHANGED_KEY } from '@/lib/auth/workspace-events';

/** Shared cookies can switch under another tab. Recheck server authority
 * before exposing that tab's previous workspace or role-dependent controls. */
export function WorkspaceSessionGuard({ userId, orgId, role, children }: {
  userId: string; orgId: string; role: UserRole; children: React.ReactNode;
}) {
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState(false);
  const inFlight = useRef<AbortController | null>(null);
  const verify = useCallback(async () => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    setChecking(true);
    setError(false);
    try {
      const response = await fetch('/api/auth/workspace', { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('Session unavailable');
      const session = await response.json();
      if (controller.signal.aborted) return;
      if (!session?.user?.id) {
        // Drop protected router cache and local state after session revocation.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign('/login');
        return;
      }
      if (session.user.id !== userId || session.user.orgId !== orgId || session.user.role !== role) {
        // A changed authorization context requires a new document, not cached routing.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign('/requests');
        return;
      }
      setChecking(false);
    } catch {
      if (!controller.signal.aborted) setError(true);
    }
  }, [userId, orgId, role]);

  useEffect(() => {
    const onFocus = () => { void verify(); };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') setChecking(true);
      else void verify();
    };
    const onStorage = (event: StorageEvent) => { if (event.key === WORKSPACE_CHANGED_KEY) void verify(); };
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) void verify(); };
    window.addEventListener('focus', onFocus);
    window.addEventListener('storage', onStorage);
    window.addEventListener('pageshow', onPageShow);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      inFlight.current?.abort();
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('pageshow', onPageShow);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [verify]);

  return <>
    {/* Preserve local form state when focus checks return the same session. */}
    <div hidden={checking} inert={checking}>{children}</div>
    {checking && <div className="p-8" role={error ? 'alert' : 'status'}>
      <p>{error ? 'Unable to verify your workspace. Check your connection and retry.' : 'Checking your workspace…'}</p>
      {error && <button className="mt-3 rounded-md border px-4 py-2" onClick={() => void verify()}>Retry</button>}
    </div>}
  </>;
}
