import { after } from 'next/server';
import { Resend } from 'resend';
import { query } from '@/lib/db/pool';
import { log } from '@/lib/logging/logger';
import { emailReadiness } from './config';

/** How long a portal sign-in link works; also the Auth.js provider maxAge. */
export const PORTAL_LINK_MINUTES = 15;

/**
 * Auth.js `sendVerificationRequest` for the client portal's email provider.
 *
 * The email goes out after the response, so the request takes as long for a
 * contact as for an unknown address (who gets no link), and a provider failure
 * never reaches the requester. Failures are logged for operators and give the
 * link back, so it no longer counts toward the outstanding-link limit. The link
 * is never stored: it is a credential, unlike outbox payloads.
 */
export async function sendPortalSignInLink({ identifier, url, expires }: { identifier: string; url: string; expires: Date }): Promise<void> {
  after(async () => {
    try {
      await deliver(identifier, url);
    } catch (error) {
      log.error('portal.sign_in_link.failed', { reason: error instanceof Error ? error.message : 'unknown' });
      await query('DELETE FROM verification_tokens WHERE identifier = $1 AND expires = $2', [identifier, expires]);
    }
  });
}

async function deliver(to: string, url: string): Promise<void> {
  const readiness = emailReadiness();
  if (readiness.state !== 'CONFIGURED') throw new Error(readiness.message);
  const result = await new Resend(process.env.RESEND_API_KEY).emails.send({
    from: process.env.EMAIL_FROM!,
    to,
    subject: 'Your client portal sign-in link',
    text: `Use this link to sign in to the client portal:\n${url}\n\nIt works once and expires in ${PORTAL_LINK_MINUTES} minutes. If you did not ask to sign in, you can ignore this email.`,
  });
  if (result.error || !result.data) throw new Error('The email provider rejected the sign-in link.');
}
