"use client"

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { renameOrganization } from '@/app/(dashboard)/settings/organization-actions';

export function OrganizationSettings({ organization, userRole }: {
  organization: { name: string; slug: string; createdAt: string }; userRole: string;
}) {
  const [savedName, setSavedName] = useState(organization.name);
  const [draft, setDraft] = useState(organization.name);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();
  return <Card>
    <CardHeader><CardTitle>Organization Details</CardTitle><CardDescription>Manage your workspace name.</CardDescription></CardHeader>
    <CardContent className="space-y-4">
      {editing ? <form className="space-y-3" onSubmit={event => {
        event.preventDefault(); setError(''); setMessage('');
        startTransition(async () => {
          try {
            const result = await renameOrganization(draft);
            if (!result.success) { setError(result.error ?? 'Unable to save. Try again.'); return; }
            setSavedName(result.name ?? draft.trim()); setEditing(false); setMessage('Organization name saved.');
          } catch { setError('Unable to save. Try again.'); }
        });
      }}>
        <label htmlFor="organization-name" className="text-sm font-medium">Organization name</label>
        <Input id="organization-name" value={draft} onChange={event => setDraft(event.target.value)} required maxLength={120} disabled={pending} autoFocus />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending || !draft.trim()}>{pending ? 'Saving…' : 'Save name'}</Button>
          <Button type="button" variant="outline" disabled={pending} onClick={() => { setEditing(false); setError(''); }}>Cancel</Button>
        </div>
      </form> : <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-muted-foreground text-sm">Name</p><p className="break-words text-sm">{savedName}</p></div>
        {userRole === 'ADMIN' && <Button variant="outline" onClick={() => { setDraft(savedName); setEditing(true); setMessage(''); }}>Edit name</Button>}
      </div>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {message && <p role="status" className="text-sm">{message}</p>}
      <div><p className="text-muted-foreground text-sm">Slug</p><p className="break-all font-mono text-sm">{organization.slug}</p>
        <p className="text-muted-foreground text-xs">The workspace identifier is permanent so existing links keep working.</p></div>
      <div><p className="text-muted-foreground text-sm">Created</p><p className="text-sm">{new Date(organization.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p></div>
    </CardContent>
  </Card>;
}
