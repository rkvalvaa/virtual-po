import { query } from '@/lib/db/pool';

/**
 * Decides whether an OAuth identity may sign in at all.
 *
 * Sign-in is closed by default. An email is admitted when it:
 *  - already belongs to a user who is a member of at least one organization,
 *  - has a pending (unexpired, unrevoked, unaccepted) invitation,
 *  - is on a domain listed in ALLOWED_EMAIL_DOMAINS, or
 *  - is the very first user of an empty deployment (bootstrap).
 *
 * Everyone else gets Auth.js's AccessDenied and no user row is created.
 */
export async function isSignInAllowed(rawEmail: string): Promise<boolean> {
  const email = rawEmail.trim().toLowerCase();
  if (!email) return false;

  const domain = email.split('@')[1] ?? '';
  if (allowedDomains().includes(domain)) return true;

  const result = await query<{ member: boolean; invited: boolean; bootstrap: boolean }>(
    `SELECT
       EXISTS (SELECT 1 FROM users u JOIN organization_users ou ON ou.user_id = u.id
               WHERE LOWER(u.email) = $1) AS member,
       EXISTS (SELECT 1 FROM organization_invitations
               WHERE email = $1 AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > NOW()) AS invited,
       NOT EXISTS (SELECT 1 FROM users) AS bootstrap`,
    [email],
  );
  const row = result.rows[0];
  return row.member || row.invited || row.bootstrap;
}

function allowedDomains(): string[] {
  return (process.env.ALLOWED_EMAIL_DOMAINS ?? '')
    .split(',')
    .map(d => d.trim().toLowerCase())
    .filter(Boolean);
}
