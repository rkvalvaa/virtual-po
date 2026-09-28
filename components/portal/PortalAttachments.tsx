"use client"

import { useState } from 'react';
import { upload } from '@vercel/blob/client';
import { Button } from '@/components/ui/button';
import { ALLOWED_MIME_TYPES, sanitizeFilename, validateAttachment } from '@/lib/storage/validate';

interface Staged { name: string; pathname: string }

/**
 * Files a client attaches to a portal form. Each goes straight to private
 * storage under this visit's staging folder; the form then submits the stored
 * paths, and the server re-checks them before attaching them to the request.
 */
export function PortalAttachments({ formId, submissionKey, stagingPrefix, maxFiles, onBusyChange, error: serverError }: {
  formId: string;
  submissionKey: string;
  stagingPrefix: string;
  maxFiles: number;
  onBusyChange: (busy: boolean) => void;
  error?: string;
}) {
  const [files, setFiles] = useState<Staged[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function add(selected: File[]) {
    setError('');
    if (files.length + selected.length > maxFiles) {
      setError(`You can attach up to ${maxFiles} file${maxFiles === 1 ? '' : 's'}.`);
      return;
    }
    const invalid = selected.map(file => validateAttachment({ name: file.name, type: file.type, size: file.size })).find(result => !result.ok);
    if (invalid && !invalid.ok) { setError(invalid.error); return; }

    setBusy(true); onBusyChange(true);
    const added: Staged[] = [];
    for (const file of selected) {
      try {
        const stored = await upload(`${stagingPrefix}${sanitizeFilename(file.name)}`, file, {
          access: 'private',
          handleUploadUrl: '/portal/upload',
          clientPayload: JSON.stringify({ formId, submissionKey }),
          contentType: file.type,
        });
        added.push({ name: file.name, pathname: stored.pathname });
      } catch {
        setError(`${sanitizeFilename(file.name)} could not be uploaded. Try again.`);
      }
    }
    setFiles(current => [...current, ...added]);
    setBusy(false); onBusyChange(false);
  }

  const inputId = `portal-files-${formId}`;
  return <div className="space-y-2">
    <label htmlFor={inputId} className="text-sm font-medium">Attach files (up to {maxFiles})</label>
    <input id={inputId} type="file" multiple accept={ALLOWED_MIME_TYPES.join(',')} disabled={busy || files.length >= maxFiles}
      className="block w-full text-sm" onChange={event => { const list = Array.from(event.target.files ?? []); event.target.value = ''; void add(list); }} />
    {busy && <p className="text-sm text-muted-foreground">Uploading…</p>}
    {files.map(file => <div key={file.pathname} className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <span className="break-all">{file.name}</span>
      <input type="hidden" name="__attachment" value={JSON.stringify(file)} />
      <Button type="button" variant="outline" size="sm" onClick={() => setFiles(current => current.filter(f => f.pathname !== file.pathname))}>Remove {file.name}</Button>
    </div>)}
    {(error || serverError) && <p role="alert" className="text-sm text-destructive">{error || serverError}</p>}
  </div>;
}
