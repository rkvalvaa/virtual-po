"use client";
import { useState, useTransition } from 'react';
import { setDocumentContext } from '@/app/(dashboard)/requests/[id]/document-actions';
import { supportsDocumentContext, DOCUMENT_LIMITS } from '@/lib/documents/limits';
import type { DocumentSelection } from '@/lib/documents/context';

export function DocumentContextControl({ attachmentId, filename, mimeType, size, selection, canSelect = true }: {
  attachmentId: string; filename: string; mimeType: string; size: number; selection?: DocumentSelection; canSelect?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  if (!supportsDocumentContext(mimeType) || size > DOCUMENT_LIMITS.fileBytes) {
    return <p className="text-xs text-muted-foreground">AI context unsupported: use plain text or Markdown up to 256 KiB.</p>;
  }
  function change(selected: boolean) {
    setError('');
    startTransition(async () => {
      try {
        const result = await setDocumentContext(attachmentId, selected);
        if (!result.success) setError(result.error ?? 'Unable to select document.');
      } catch { setError('Unable to process document. Please retry.'); }
    });
  }
  return <div className="mt-2 space-y-1 text-xs">
    <label className="flex items-center gap-2">
      <input type="checkbox" checked={!!selection} disabled={pending || !canSelect} onChange={event => change(event.target.checked)} />
      Use {filename} in AI assessments
    </label>
    {(pending || selection) && <p role="status">{pending || selection?.status === 'PENDING' ? 'Processing pending' : selection?.status === 'PROCESSED' ? `Processed${selection.truncated ? ' · truncated to the first 16 KiB' : ''}` : 'Processing error'}</p>}
    {selection?.error && <p>{selection.error}</p>}
    {canSelect && selection && selection.status !== 'PROCESSED' && <button className="underline" disabled={pending} onClick={() => change(true)}>Retry processing {filename}</button>}
    {error && <p role="alert" className="text-destructive">{error}</p>}
  </div>;
}
