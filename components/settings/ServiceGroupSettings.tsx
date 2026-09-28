"use client"

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { manageServiceGroups } from '@/app/(dashboard)/settings/service-group-actions';
import type { ServiceGroup } from '@/lib/db/queries/service-groups';

type Member = { userId: string; label: string };
const selectClass = 'block h-9 w-full max-w-full rounded-md border border-input bg-background px-2 text-sm';

export function ServiceGroupSettings({ groups, members }: { groups: ServiceGroup[]; members: Member[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  function submit(input: unknown, form?: HTMLFormElement) {
    setError('');
    startTransition(async () => {
      try {
        const result = await manageServiceGroups(input);
        if (!result.success) setError(result.error ?? 'Unable to update service groups.');
        else form?.reset();
        router.refresh();
      } catch { setError('Unable to update service groups. Try again.'); }
    });
  }
  const field = (event: FormEvent<HTMLFormElement>, key: string) => String(new FormData(event.currentTarget).get(key) ?? '').trim();
  const options = (list: Member[]) => list.map(m => <option key={m.userId} value={m.userId}>{m.label}</option>);

  return <Card>
    <CardHeader><CardTitle>Service groups</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <p className="text-sm text-muted-foreground">Teams that own change requests. Only workspace members can join. The fallback owner takes over a member&apos;s assigned requests when that member leaves the workspace.</p>
      <form className="flex flex-wrap items-end gap-2" onSubmit={event => {
        event.preventDefault(); submit({ kind: 'create', name: field(event, 'name'), fallbackOwnerId: field(event, 'owner') }, event.currentTarget);
      }}>
        <div className="min-w-0 flex-1"><label htmlFor="group-name" className="text-sm">Group name</label><Input id="group-name" name="name" required maxLength={120} disabled={pending} /></div>
        <div className="min-w-0 flex-1"><label htmlFor="group-owner" className="text-sm">Fallback owner</label>
          <select id="group-owner" name="owner" required className={selectClass} disabled={pending}>{options(members)}</select></div>
        <Button type="submit" disabled={pending}>Add group</Button>
      </form>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!groups.length && <p className="text-sm text-muted-foreground">No service groups yet.</p>}
      {groups.map(group => {
        const outside = members.filter(m => !group.members.some(gm => gm.userId === m.userId));
        return <section key={group.id} aria-label={group.name} className="min-w-0 space-y-3 border-t pt-3">
          <form className="flex flex-wrap items-end gap-2" onSubmit={event => {
            event.preventDefault(); submit({ kind: 'rename', groupId: group.id, name: field(event, 'name') });
          }}>
            <div className="min-w-0 flex-1"><label htmlFor={`rename-${group.id}`} className="text-sm font-medium">Rename {group.name}</label>
              <Input id={`rename-${group.id}`} name="name" defaultValue={group.name} required maxLength={120} disabled={pending} /></div>
            <Button type="submit" variant="outline" size="sm" disabled={pending}>Save name for {group.name}</Button>
            <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => submit({ kind: 'archive', groupId: group.id })}>Archive {group.name}</Button>
          </form>
          <p className="text-sm">Fallback owner: {group.fallbackOwnerName}</p>
          <form className="flex flex-wrap items-end gap-2" onSubmit={event => {
            event.preventDefault(); submit({ kind: 'setFallbackOwner', groupId: group.id, userId: field(event, 'owner') });
          }}>
            <div className="min-w-0 flex-1"><label htmlFor={`owner-${group.id}`} className="text-sm">Fallback owner for {group.name}</label>
              <select id={`owner-${group.id}`} name="owner" defaultValue={group.fallbackOwnerId} className={selectClass} disabled={pending}>{options(members)}</select></div>
            <Button type="submit" variant="outline" size="sm" disabled={pending}>Save fallback owner for {group.name}</Button>
          </form>
          {!group.members.length && <p className="text-sm text-muted-foreground">No members.</p>}
          <ul className="space-y-1">
            {group.members.map(m => <li key={m.userId} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="break-all">{m.name ?? m.email} · {m.role === 'LEAD' ? 'Lead' : 'Member'}</span>
              <Button variant="outline" size="sm" disabled={pending} onClick={() => submit({ kind: 'removeMember', groupId: group.id, userId: m.userId })}>
                Remove {m.name ?? m.email} from {group.name}</Button>
            </li>)}
          </ul>
          {outside.length > 0 && <form className="flex flex-wrap items-end gap-2" onSubmit={event => {
            event.preventDefault(); submit({ kind: 'setMember', groupId: group.id, userId: field(event, 'user'), role: field(event, 'role') }, event.currentTarget);
          }}>
            <div className="min-w-0 flex-1"><label htmlFor={`member-${group.id}`} className="text-sm">Add member to {group.name}</label>
              <select id={`member-${group.id}`} name="user" required className={selectClass} disabled={pending}>{options(outside)}</select></div>
            <div className="min-w-0"><label htmlFor={`role-${group.id}`} className="text-sm">Role in {group.name}</label>
              <select id={`role-${group.id}`} name="role" defaultValue="MEMBER" className={selectClass} disabled={pending}>
                <option value="MEMBER">Member</option><option value="LEAD">Lead</option></select></div>
            <Button type="submit" size="sm" disabled={pending}>Add to {group.name}</Button>
          </form>}
        </section>;
      })}
    </CardContent>
  </Card>;
}
