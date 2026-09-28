import { query, transaction } from '@/lib/db/pool';
import { enqueueClientMessageEmail } from '@/lib/email/outbox';
import { logActivity } from './activity-log';

/** Internal view of a portal request's client thread, with who wrote each message. */
export interface ClientMessage {
  id: string;
  direction: 'TO_CLIENT' | 'FROM_CLIENT';
  body: string;
  authorName: string | null;
  createdAt: string;
}

export const MAX_MESSAGE_LENGTH = 5000;

export async function listClientMessages(orgId: string, requestId: string): Promise<ClientMessage[]> {
  const result = await query(`SELECT m.id, m.direction, m.body, m.created_at,
      COALESCE(u.name, u.email, c.name, c.email) AS author_name
    FROM request_external_messages m
    LEFT JOIN users u ON u.id = m.author_user_id
    LEFT JOIN client_contacts c ON c.id = m.author_contact_id
    WHERE m.organization_id = $1 AND m.request_id = $2 ORDER BY m.created_at, m.id`, [orgId, requestId]);
  return result.rows.map(row => ({
    id: row.id, direction: row.direction, body: row.body, authorName: row.author_name, createdAt: row.created_at.toISOString(),
  }));
}

/**
 * Send a message the client will see, and email them a portal link. Only for
 * requests that came in through the portal, and only by a current REVIEWER or
 * ADMIN of the request's organization.
 */
export async function sendClientMessage(orgId: string, actorId: string, requestId: string, rawBody: string): Promise<void> {
  const body = rawBody.trim();
  if (!body || body.length > MAX_MESSAGE_LENGTH) throw new Error(`Write a message of 1 to ${MAX_MESSAGE_LENGTH} characters.`);
  await transaction(async () => {
    const actor = await query(`SELECT 1 FROM organization_users WHERE organization_id = $1 AND user_id = $2 AND role IN ('REVIEWER', 'ADMIN')`,
      [orgId, actorId]);
    if (!actor.rowCount) throw new Error('A current reviewer or administrator is required to message the client.');
    const request = await query(`SELECT r.title, r.public_reference, c.email, c.name, u.id AS user_id
      FROM feature_requests r
      LEFT JOIN client_contacts c ON c.id = r.submitter_contact_id
      LEFT JOIN users u ON lower(u.email) = c.email
      WHERE r.id = $1 AND r.organization_id = $2 FOR SHARE OF r`, [requestId, orgId]);
    const row = request.rows[0];
    if (!row) throw new Error('Request not found.');
    if (!row.public_reference || !row.email) throw new Error('Only requests sent through the client portal have a client to message.');

    const inserted = await query(`INSERT INTO request_external_messages (request_id, organization_id, direction, author_user_id, body)
      VALUES ($1, $2, 'TO_CLIENT', $3, $4) RETURNING id`, [requestId, orgId, actorId, body]);
    const messageId = inserted.rows[0].id;
    await logActivity({ organizationId: orgId, requestId, userId: actorId, action: 'CLIENT_MESSAGE', entityType: 'REQUEST', entityId: requestId,
      metadata: { direction: 'TO_CLIENT', messageId } });
    if (row.user_id) {
      await enqueueClientMessageEmail({
        organizationId: orgId, externalMessageId: messageId, recipientUserId: row.user_id, recipientEmail: row.email, recipientName: row.name,
        title: `New message about "${row.title}"`, message: body, link: `/portal/requests/${row.public_reference}`,
      });
    }
  });
}
