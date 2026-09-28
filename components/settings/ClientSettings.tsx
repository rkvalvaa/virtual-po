"use client"

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { manageClients } from '@/app/(dashboard)/settings/client-actions';
import type { ClientAccount, ClientContact } from '@/lib/db/queries/client-accounts';

export function ClientSettings({ accounts, readiness }: { accounts: ClientAccount[]; readiness: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  function submit(input: unknown, form?: HTMLFormElement) {
    setError('');
    startTransition(async () => {
      try {
        const result = await manageClients(input);
        if (!result.success) setError(result.error ?? 'Unable to update clients.');
        else form?.reset();
        router.refresh();
      } catch { setError('Unable to update clients. Try again.'); }
    });
  }
  const field = (event: FormEvent<HTMLFormElement>, key: string) => String(new FormData(event.currentTarget).get(key) ?? '').trim();

  return <Card>
    <CardHeader><CardTitle>Clients</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <p className="text-sm text-muted-foreground">Client contacts are not workspace members and never receive an internal role. They sign in at /portal/login with a one-time email link.</p>
      {readiness && <p className="text-sm text-muted-foreground">{readiness}</p>}
      <form className="flex flex-wrap items-end gap-2" onSubmit={event => {
        event.preventDefault(); submit({ kind: 'createAccount', name: field(event, 'name') }, event.currentTarget);
      }}>
        <div className="min-w-0 flex-1"><label htmlFor="client-name" className="text-sm">Client name</label><Input id="client-name" name="name" required maxLength={120} disabled={pending} /></div>
        <Button type="submit" disabled={pending}>Add client</Button>
      </form>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!accounts.length && <p className="text-sm text-muted-foreground">No clients yet.</p>}
      {accounts.map(account => <div key={account.id} className="space-y-3 border-t pt-3">
        <form className="flex flex-wrap items-end gap-2" onSubmit={event => {
          event.preventDefault(); submit({ kind: 'renameAccount', id: account.id, name: field(event, 'name') });
        }}>
          <div className="min-w-0 flex-1"><label htmlFor={`rename-${account.id}`} className="text-sm font-medium">Rename {account.name}</label>
            <Input id={`rename-${account.id}`} name="name" defaultValue={account.name} required maxLength={120} disabled={pending} /></div>
          <Button type="submit" variant="outline" size="sm" disabled={pending}>Save name for {account.name}</Button>
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => submit({ kind: 'archiveAccount', id: account.id })}>Archive {account.name}</Button>
        </form>
        {!account.contacts.length && <p className="text-sm text-muted-foreground">No contacts.</p>}
        {account.contacts.map(contact => <div key={contact.id} className="space-y-1 text-sm">
          <p className="break-all">{contact.name ? `${contact.name} · ` : ''}{contact.email}{contact.revokedAt ? ' · revoked' : ''}</p>
          {!contact.revokedAt && <>
            <p className="text-xs text-muted-foreground">{welcomeStatus(contact)}</p>
            {contact.inviteDeliveryError && <p className="text-sm text-destructive">{contact.inviteDeliveryError}</p>}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={pending || !!readiness} onClick={() => submit({ kind: 'resendWelcome', id: contact.id })}>Resend welcome to {contact.email}</Button>
              <Button variant="outline" size="sm" disabled={pending} onClick={() => submit({ kind: 'revokeContact', id: contact.id })}>Revoke {contact.email}</Button>
            </div>
          </>}
        </div>)}
        <form className="flex flex-wrap items-end gap-2" onSubmit={event => {
          event.preventDefault();
          submit({ kind: 'addContact', accountId: account.id, email: field(event, 'email'), name: field(event, 'contactName') }, event.currentTarget);
        }}>
          <div className="min-w-0 flex-1"><label htmlFor={`contact-email-${account.id}`} className="text-sm">Contact email for {account.name}</label>
            <Input id={`contact-email-${account.id}`} name="email" type="email" required disabled={pending} /></div>
          <div className="min-w-0 flex-1"><label htmlFor={`contact-name-${account.id}`} className="text-sm">Contact name for {account.name} (optional)</label>
            <Input id={`contact-name-${account.id}`} name="contactName" maxLength={120} disabled={pending} /></div>
          <Button type="submit" size="sm" disabled={pending}>Add contact to {account.name}</Button>
        </form>
      </div>)}
    </CardContent>
  </Card>;
}

function welcomeStatus(contact: ClientContact): string {
  if (contact.inviteDeliveryStatus === 'SENT') return 'Welcome email accepted by email provider; this does not confirm inbox delivery';
  if (contact.inviteDeliveryStatus === 'FAILED') return 'Welcome email failed';
  return 'Welcome email not sent';
}
