"use client"

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { manageInvitation } from '@/app/(dashboard)/settings/invitation-actions';
import type { PendingInvitation } from '@/lib/db/queries/invitations';

export function InvitationSettings({ invitations, readiness }: { invitations: PendingInvitation[]; readiness: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  function submit(input: unknown) {
    setError(''); setMessage('');
    startTransition(async () => {
      try {
        const result = await manageInvitation(input);
        if (!result.success) setError(result.error ?? 'Unable to manage invitation.');
        else setMessage('Invitation updated.');
        router.refresh();
      } catch { setError('Unable to manage invitation. Try again.'); }
    });
  }
  return <Card>
    <CardHeader><CardTitle>Invitations</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      {readiness && <p className="text-sm text-muted-foreground">{readiness}</p>}
      <form className="space-y-3" onSubmit={event => {
        event.preventDefault(); const data = new FormData(event.currentTarget);
        submit({ kind: 'create', email: String(data.get('email')).trim(), role: data.get('role') });
      }}>
        <div><label htmlFor="invite-email" className="text-sm">Email</label><Input id="invite-email" name="email" type="email" required disabled={pending} /></div>
        <div><label htmlFor="invite-role" className="mr-3 text-sm">Role</label><select id="invite-role" name="role" defaultValue="STAKEHOLDER" className="rounded-md border bg-background p-2 text-sm" disabled={pending}>
          <option value="STAKEHOLDER">Stakeholder</option><option value="REVIEWER">Reviewer</option><option value="ADMIN">Administrator</option>
        </select></div>
        <Button type="submit" disabled={pending || !!readiness}>Send invitation</Button>
      </form>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {message && <p role="status" className="text-sm">{message}</p>}
      <h3 className="text-sm font-medium">Pending invitations</h3>
      {!invitations.length && <p className="text-sm text-muted-foreground">No pending invitations.</p>}
      {invitations.map(invite => <div key={invite.id} className="space-y-2 border-t pt-3">
        <p className="break-all text-sm">{invite.email} · {invite.role}</p>
        <p className="text-xs text-muted-foreground">{invite.deliveryStatus === 'SENT' ? 'Accepted by email provider; this does not confirm inbox delivery' : invite.deliveryStatus === 'FAILED' ? 'Email failed' : 'Delivery pending'} · Expires {new Date(invite.expiresAt).toLocaleDateString()}</p>
        {invite.deliveryError && <p className="text-sm text-destructive">{invite.deliveryError}</p>}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={pending || !!readiness} onClick={() => submit({ kind: 'resend', id: invite.id })}>Resend to {invite.email}</Button>
          <Button variant="outline" size="sm" disabled={pending} onClick={() => submit({ kind: 'revoke', id: invite.id })}>Revoke invitation for {invite.email}</Button>
        </div>
      </div>)}
    </CardContent>
  </Card>;
}
