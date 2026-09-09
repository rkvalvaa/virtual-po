"use client"
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { joinInvitedOrganization } from './actions';

export function AcceptInvitation({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  return <div className="space-y-3">
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button disabled={pending} onClick={() => startTransition(async () => {
      try {
        const result = await joinInvitedOrganization(token);
        if (!result.success) { setError(result.error ?? 'Unable to join workspace.'); return; }
        router.push('/requests'); router.refresh();
      } catch { setError('Unable to join workspace. Try again.'); }
    })}>{pending ? 'Joining…' : 'Accept invitation'}</Button>
  </div>;
}
