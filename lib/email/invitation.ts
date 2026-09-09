import { Resend } from 'resend';
import type { InvitationDelivery } from '@/lib/db/queries/invitations';
import { emailReadiness, getApplicationBaseUrl } from './config';

export function invitationEmailReadiness(): string | null {
  const readiness = emailReadiness();
  return readiness.state === 'CONFIGURED' ? null : readiness.message;
}

export async function sendInvitationEmail(invite: InvitationDelivery): Promise<{ success: boolean; error?: string }> {
  const error = invitationEmailReadiness();
  if (error) return { success: false, error };
  const origin = getApplicationBaseUrl();
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
