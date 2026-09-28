import { Resend } from 'resend';
import { emailReadiness } from './config';

/** How long a portal sign-in link works; also the Auth.js provider maxAge. */
export const PORTAL_LINK_MINUTES = 15;

/**
 * Auth.js `sendVerificationRequest` for the client portal's email provider.
 * Throwing makes Auth.js show its error page rather than claim a link was sent.
 */
export async function sendPortalSignInLink({ identifier, url }: { identifier: string; url: string; expires: Date }): Promise<void> {
  const readiness = emailReadiness();
  if (readiness.state !== 'CONFIGURED') throw new Error(readiness.message);
  const result = await new Resend(process.env.RESEND_API_KEY).emails.send({
    from: process.env.EMAIL_FROM!,
    to: identifier,
    subject: 'Your client portal sign-in link',
    text: `Use this link to sign in to the client portal:\n${url}\n\nIt works once and expires in ${PORTAL_LINK_MINUTES} minutes. If you did not ask to sign in, you can ignore this email.`,
  });
  if (result.error || !result.data) throw new Error('The email provider rejected the sign-in link.');
}
