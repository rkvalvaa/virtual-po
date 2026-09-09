"use client"

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { updateMember } from '@/app/(dashboard)/settings/organization-actions';
import type { MemberChange } from '@/lib/db/queries/organization-members';
import type { UserRole } from '@/lib/types/database';

export interface MemberSummary { userId: string; userName: string | null; userEmail: string; role: string; joinedAt: string }

export function MemberSettings({ members, currentUserId, userRole }: { members: MemberSummary[]; currentUserId: string; userRole: string }) {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState<{ member: MemberSummary; change: MemberChange } | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();
  return <Card>
    <CardHeader><CardTitle>Members</CardTitle><CardDescription>{members.length} members in your organization.</CardDescription></CardHeader>
    <CardContent className="space-y-4">
      {members.map(member => {
        const name = member.userName ?? member.userEmail;
        return <div key={member.userId} className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
          <div className="min-w-0"><p className="break-words text-sm font-medium">{name}{member.userId === currentUserId ? ' (you)' : ''}</p>
            <p className="break-all text-sm text-muted-foreground">{member.userEmail}</p></div>
          {userRole === 'ADMIN' ? <div className="flex flex-wrap items-center gap-2">
            <select aria-label={`Role for ${name}`} value={member.role} className="rounded-md border bg-background p-2 text-sm" disabled={pending}
              onChange={event => { setError(''); setConfirmation({ member, change: { kind: 'role', role: event.target.value as UserRole } }); }}>
              <option value="ADMIN">Administrator</option><option value="REVIEWER">Reviewer</option><option value="STAKEHOLDER">Stakeholder</option>
            </select>
            {member.userId !== currentUserId && <Button variant="outline" size="sm" onClick={() => { setError(''); setConfirmation({ member, change: { kind: 'handover' } }); }}>Hand over to {name}</Button>}
            <Button variant="outline" size="sm" onClick={() => { setError(''); setConfirmation({ member, change: { kind: 'remove' } }); }}>Remove {name}</Button>
          </div> : <p className="text-sm">{member.role}</p>}
        </div>;
      })}
      <p className="text-xs text-muted-foreground">Removed members lose access immediately. Their assigned requests are unassigned; their authored requests and history are retained. Reassign named approval steps before removing review access. At least one administrator must remain.</p>
      {message && <p role="status" className="text-sm">{message}</p>}
      <Dialog open={confirmation !== null} onOpenChange={open => { if (!open && !pending) setConfirmation(null); }}>
        <DialogContent role="alertdialog">
          <DialogTitle>Confirm membership change</DialogTitle>
          <DialogDescription>
            {confirmation?.change.kind === 'remove' ? `Remove ${confirmation.member.userEmail}? Their assigned requests will be unassigned and access revoked.` :
              confirmation?.change.kind === 'handover' ? `Make ${confirmation.member.userEmail} an administrator and change your own role to Reviewer?` :
                `Change ${confirmation?.member.userEmail} to ${confirmation?.change.kind === 'role' ? confirmation.change.role : ''}? Permissions change immediately.`}
          </DialogDescription>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={pending} onClick={() => setConfirmation(null)}>Cancel</Button>
            <Button disabled={pending} onClick={() => {
              if (!confirmation) return;
              startTransition(async () => {
                try {
                  const result = await updateMember(confirmation.member.userId, confirmation.change);
                  if (!result.success) { setError(result.error ?? 'Unable to update member.'); return; }
                  setConfirmation(null); setMessage('Membership updated.'); router.refresh();
                } catch { setError('Unable to update member. Try again.'); }
              });
            }}>{pending ? 'Updating…' : 'Confirm change'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </CardContent>
  </Card>;
}
