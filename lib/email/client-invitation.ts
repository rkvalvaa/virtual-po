import { Resend } from 'resend';
import type { ClientWelcome } from '@/lib/db/queries/client-accounts';
import { getApplicationBaseUrl } from './config';
import { invitationEmailReadiness } from './invitation';

/** Tells a new client contact where to sign in. Carries no credential: the portal sends a one-time link on request. */
export async function sendClientWelcomeEmail(welcome: ClientWelcome): Promise<{ success: boolean; error?: string }> {
  const error = invitationEmailReadiness();
  if (error) return { success: false, error };
  const origin = getApplicationBaseUrl();
  try {
    const result = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: process.env.EMAIL_FROM!, to: welcome.email,
      subject: `${welcome.organizationName} client portal access`,
      text: `${welcome.organizationName} has given you access to its client portal for ${welcome.clientName}.\n\nSign in with ${welcome.email} at:\n${origin}/portal/login\n\nWe will email you a one-time sign-in link. If you did not expect this, you can ignore it.`,
    });
    if (result.error || !result.data) return { success: false, error: 'Email provider rejected delivery. Verify sender configuration and resend.' };
    return { success: true };
  } catch { return { success: false, error: 'Email delivery failed. Check provider configuration and resend.' }; }
}
