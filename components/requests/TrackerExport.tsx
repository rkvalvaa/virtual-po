'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { syncEpicToLinear } from '@/app/(dashboard)/settings/linear-actions';
import { syncEpicToJira } from '@/app/(dashboard)/settings/jira-actions';
import { syncToGitHubIssues } from '@/app/(dashboard)/settings/github-issues-actions';
import type { ExportResult } from '@/lib/export/durable';

export function TrackerExport({ requestId, provider, initial, url, canExport = true }: {
  requestId: string; provider: 'LINEAR' | 'JIRA' | 'GITHUB_ISSUES'; initial?: ExportResult; url?: string | null; canExport?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const router = useRouter();
  const name = provider === 'LINEAR' ? 'Linear' : provider === 'JIRA' ? 'Jira' : 'GitHub';
  const action = provider === 'LINEAR' ? syncEpicToLinear : provider === 'JIRA' ? syncEpicToJira : syncToGitHubIssues;
  return <section aria-label={`${name} export`} className="space-y-2 rounded-md border p-3">
    <div className="flex flex-wrap items-center gap-3">
      <strong className="text-sm">{name}</strong>
      {initial && <span className="text-sm" role="status">{initial.status === 'complete' ? 'Complete' : initial.status === 'partial' ? 'Partial export' : 'Export failed'} · {initial.items.filter(item => item.state === 'complete').length}/{initial.items.length} items</span>}
      {url && <a className="text-sm underline" href={url} target="_blank" rel="noopener noreferrer">View in {name}</a>}
      {canExport && initial?.status !== 'complete' && <Button size="sm" variant="outline" disabled={pending} onClick={() => startTransition(async () => {
        setError(undefined);
        try { const result = await action(requestId); if (!result.success) setError(result.error ?? 'Export failed.'); }
        catch { setError('The export was interrupted. Retry to recover saved progress.'); }
        router.refresh();
      })}>{pending ? 'Exporting…' : initial || url ? 'Retry / resume export' : `Push to ${name}`}</Button>}
    </div>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {initial && <details><summary className="cursor-pointer text-sm">Item progress</summary><ul className="mt-2 space-y-2 text-sm">
      {initial.items.map(item => <li key={item.id}>
        {item.external ? <a className="underline" href={item.external.url} target="_blank" rel="noopener noreferrer">{item.title}</a> : item.title}
        {' — '}{item.state === 'complete' ? 'Complete' : item.state === 'created' ? 'Created; linking incomplete' : item.state === 'unknown' ? 'Checking creation outcome' : 'Waiting to export'}
        {item.error && <p className="text-destructive">{item.error}</p>}
      </li>)}
    </ul></details>}
    <p className="text-xs text-muted-foreground">Exported content is frozen here. Make later content changes in {name}; retries resume unfinished items.</p>
  </section>;
}
