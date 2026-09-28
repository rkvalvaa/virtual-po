"use client"

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { ReplyState } from '@/app/portal/requests/[reference]/actions';

export function PortalReply({ reply }: { reply: (previous: ReplyState, formData: FormData) => Promise<ReplyState> }) {
  const [state, action, pending] = useActionState(reply, null);
  return <form action={action} className="space-y-2">
    <label htmlFor="portal-reply" className="text-sm font-medium">Your reply</label>
    <Textarea id="portal-reply" name="body" required maxLength={5000} disabled={pending} />
    {state?.status === 'error' && <p role="alert" className="text-sm text-destructive">{state.message}</p>}
    <Button type="submit" size="sm" disabled={pending}>Send reply</Button>
  </form>;
}
