import { Resend } from 'resend';
import type { InvitationDelivery } from '@/lib/db/queries/invitations';

export function invitationEmailReadiness(): string | null {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) return 'Email delivery requires RESEND_API_KEY and EMAIL_FROM. Configure delivery before inviting members.';
  try {
    const url = new URL(process.env.AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? '');
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error();
    if (url.username || url.password) throw new Error();
  } catch { return 'Configure a valid AUTH_URL or NEXT_PUBLIC_APP_URL for invitation links.'; }
  return null;
}

export async function sendInvitationEmail(invite: InvitationDelivery): Promise<{ success: boolean; error?: string }> {
  const error = invitationEmailReadiness();
  if (error) return { success: false, error };
  const origin = new URL(process.env.AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL!).origin;
  try {
    const result = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: process.env.EMAIL_FROM!, to: invite.email,
      subject: 'Invitation to a Virtual Product Owner workspace',
      text: `You have been invited to ${invite.organizationName} as ${invite.role}.\n\nSign in with ${invite.email} to accept:\n${origin}/invite/${invite.token}\n\nThis invitation expires in seven days. Your existing workspaces will be retained. If you did not expect this invitation, you can ignore it.`,
    });
    if (result.error || !result.data) return { success: false, error: 'Email provider rejected delivery. Verify sender configuration and resend.' };
    return { success: true };
  } catch { return { success: false, error: 'Email delivery failed. Check provider configuration and resend.' }; }
}
