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

/** Links a client may have outstanding at once; more are silently not sent. */
const MAX_OUTSTANDING_PORTAL_LINKS = 3;

const ACTIVE_CONTACT = `EXISTS (SELECT 1 FROM client_contacts c
  JOIN client_accounts a ON a.id = c.client_account_id AND a.archived_at IS NULL
  WHERE c.email = $1 AND c.revoked_at IS NULL)`;

/** Whether an email-link sign-in may complete: the address is an active client contact. */
export async function hasPortalAccess(rawEmail: string): Promise<boolean> {
  const result = await query<{ allowed: boolean }>(`SELECT ${ACTIVE_CONTACT} AS allowed`, [rawEmail.trim().toLowerCase()]);
  return result.rows[0].allowed;
}

/** Whether to send a portal sign-in link now: an active contact, under the outstanding-link limit. */
export async function mayRequestPortalLink(rawEmail: string): Promise<boolean> {
  const result = await query<{ allowed: boolean; outstanding: number }>(
    `SELECT ${ACTIVE_CONTACT} AS allowed,
       (SELECT COUNT(*) FROM verification_tokens WHERE identifier = $1 AND expires > NOW())::int AS outstanding`,
    [rawEmail.trim().toLowerCase()],
  );
  const row = result.rows[0];
  return row.allowed && row.outstanding < MAX_OUTSTANDING_PORTAL_LINKS;
}

function allowedDomains(): string[] {
  return (process.env.ALLOWED_EMAIL_DOMAINS ?? '')
    .split(',')
    .map(d => d.trim().toLowerCase())
    .filter(Boolean);
}
