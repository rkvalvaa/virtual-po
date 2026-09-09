'use client';
import { useState, useTransition } from 'react';
import { archiveRequests } from '@/app/(dashboard)/requests/archive-actions';
import { Button } from '@/components/ui/button';

export function ArchiveControl({ requestId, archived, canManage }: { requestId: string; archived: boolean; canManage: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  function change() {
    setError('');
    startTransition(async () => {
      try {
        const [result] = await archiveRequests([requestId], !archived);
        if (!result.success) setError(result.error ?? 'Unable to update request.');
      } catch { setError('Unable to update request. Please retry.'); }
    });
  }
  return <div className="mb-4 flex flex-wrap items-center gap-3">
    {archived && <p role="status" className="text-sm text-muted-foreground">Archived. History and attachments are retained. Restore to resume work.</p>}
    {canManage && <Button variant="outline" disabled={pending} onClick={change}>{pending ? 'Saving…' : archived ? 'Restore request' : 'Archive request'}</Button>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}
