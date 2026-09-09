import Link from 'next/link';
import { createHash } from 'node:crypto';
import { auth, signOut } from '@/auth';
import { query } from '@/lib/db/pool';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AcceptInvitation } from './AcceptInvitation';

export const metadata = { title: 'Workspace invitation', robots: { index: false, follow: false }, referrer: 'no-referrer' as const };

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{64}$/.test(token)) return <p>Invalid invitation.</p>;
  const session = await auth();
  if (!session?.user) return <Card><CardHeader><CardTitle>Workspace invitation</CardTitle><CardDescription>Sign in with the email address that received this invitation. Existing workspaces will be retained.</CardDescription></CardHeader>
    <CardContent><Link href={`/login?returnTo=${encodeURIComponent(`/invite/${token}`)}`}>Sign in to accept</Link></CardContent></Card>;
  const result = await query(`SELECT o.name, i.role, i.email, i.revoked_at, i.expires_at <= NOW() AS expired, i.accepted_at
    FROM organization_invitations i JOIN organizations o ON o.id = i.organization_id WHERE i.token_hash = $1`, [createHash('sha256').update(token).digest('hex')]);
  const invite = result.rows[0];
  if (!invite || invite.revoked_at || (invite.expired && !invite.accepted_at)) return <p>This invitation is unavailable or expired. Ask the workspace administrator for a new invitation.</p>;
  const recipientMatches = session.user.email?.trim().toLowerCase() === invite.email;
  return <Card><CardHeader><CardTitle>Join {invite.name}</CardTitle><CardDescription>You were invited as {invite.role}. Your existing workspaces will be retained.</CardDescription></CardHeader>
    <CardContent className="space-y-3">
      {recipientMatches ? <AcceptInvitation token={token} /> : <p role="alert">This invitation was sent to another account. Sign out and sign in with the invited email address.</p>}
      <form action={async () => { 'use server'; await signOut({ redirectTo: `/invite/${token}` }); }}><Button variant="outline" type="submit">Sign out to use another account</Button></form>
    </CardContent></Card>;
}
