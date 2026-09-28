import { randomInt } from 'node:crypto';
import { query, transaction } from '@/lib/db/pool';
import { formDefinitionSchema, validateAnswers, type FormDefinition } from '@/lib/forms/definition';
import type { RawCustomFieldValues } from '@/lib/utils/custom-fields';
import { getOrganizationUsers } from './organizations';
import { notifyUser } from './notifications';
import { logActivity } from './activity-log';
import { projectHistory, toExternalStatus, type ExternalStatus, type HistoryEntry, type StatusEvent } from '@/lib/portal/status';

/**
 * Every read here is scoped to the signed-in contact's client account. Never
 * reuse dashboard queries for the portal: they authorize by organization only.
 */

export const PORTAL_SUBMISSIONS_PER_HOUR = 10;
// No 0/O, 1/I/L: references get read aloud and typed back.
const REFERENCE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export interface PortalContact { userId: string; clientContactId: string; clientAccountId: string }
export interface PortalForm { id: string; organizationName: string; definition: FormDefinition }
export type SubmissionResult =
  | { status: 'received'; reference: string }
  | { status: 'invalid'; errors: Record<string, string> };

export async function listPortalForms(clientAccountId: string): Promise<{ id: string; title: string }[]> {
  const result = await query(`SELECT id, published->>'title' AS title FROM intake_forms
    WHERE client_account_id = $1 AND status = 'PUBLISHED' ORDER BY published->>'title'`, [clientAccountId]);
  return result.rows.map(row => ({ id: row.id, title: row.title }));
}

export async function getPortalForm(formId: string, clientAccountId: string): Promise<PortalForm | null> {
  const result = await query(`SELECT f.id, f.published, o.name AS organization_name FROM intake_forms f
    JOIN organizations o ON o.id = f.organization_id
    WHERE f.id = $1 AND f.client_account_id = $2 AND f.status = 'PUBLISHED'`, [formId, clientAccountId]);
  const row = result.rows[0];
  return row ? { id: row.id, organizationName: row.organization_name, definition: formDefinitionSchema.parse(row.published) } : null;
}

/**
 * File a request from a published form. The organization, form version and
 * client come from the form row, never from the submission. A retried
 * submission (same key) returns the original receipt.
 */
export async function submitPortalRequest(params: {
  formId: string; contact: PortalContact; submissionKey: string; answers: RawCustomFieldValues;
}): Promise<SubmissionResult> {
  const { formId, contact, submissionKey, answers } = params;
  return transaction(async () => {
    const form = await query(`SELECT id, organization_id, version, published FROM intake_forms
      WHERE id = $1 AND client_account_id = $2 AND status = 'PUBLISHED' FOR SHARE`, [formId, contact.clientAccountId]);
    if (!form.rowCount) throw new Error('Form not found.');
    const { organization_id: orgId, version } = form.rows[0];

    const earlier = await receiptFor(orgId, contact.userId, submissionKey);
    if (earlier) return earlier;

    const recent = await query(`SELECT COUNT(*)::int AS n FROM feature_requests
      WHERE submitter_contact_id = $1 AND created_at > NOW() - INTERVAL '1 hour'`, [contact.clientContactId]);
    if (recent.rows[0].n >= PORTAL_SUBMISSIONS_PER_HOUR) throw new Error('You have sent many requests in the last hour. Try again later.');

    const definition = formDefinitionSchema.parse(form.rows[0].published);
    const validation = validateAnswers(definition, answers);
    if (!validation.ok) return { status: 'invalid', errors: validation.errors };

    const snapshot = definition.fields.filter(f => f.key in validation.values)
      .map(f => ({ key: f.key, label: f.label, value: validation.values[f.key] }));
    const title = String(validation.values[definition.titleFieldKey!]);
    const summary = snapshot.filter(a => a.key !== definition.titleFieldKey && a.value !== null)
      .map(a => `${a.label}: ${a.value}`).join('\n');
    const inserted = await query(`INSERT INTO feature_requests (organization_id, requester_id, title, summary, status, intake_complete,
        creation_key, source_form_id, source_form_version, client_account_id, submitter_contact_id, form_answers, public_reference)
      VALUES ($1, $2, $3, $4, 'UNDER_REVIEW', true, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (organization_id, requester_id, creation_key) WHERE creation_key IS NOT NULL DO NOTHING
      RETURNING id, public_reference`,
      [orgId, contact.userId, title, summary, submissionKey, formId, version, contact.clientAccountId, contact.clientContactId,
        JSON.stringify(snapshot), newReference()]);
    if (!inserted.rowCount) return (await receiptFor(orgId, contact.userId, submissionKey))!;

    const requestId = inserted.rows[0].id;
    await logActivity({ organizationId: orgId, requestId, userId: contact.userId, action: 'REQUEST_CREATED', entityType: 'REQUEST', entityId: requestId,
      metadata: { source: 'portal', formId, formVersion: version, clientAccountId: contact.clientAccountId } });
    await notifyReviewers(orgId, requestId, title, contact.userId);
    return { status: 'received', reference: inserted.rows[0].public_reference };
  });
}

export interface MyRequestSummary { reference: string; title: string; status: ExternalStatus; submittedAt: string }
export interface PortalMessage { from: 'team' | 'you'; body: string; at: string }
export interface MyRequest extends MyRequestSummary {
  answers: { label: string; value: string | number | null }[];
  history: HistoryEntry[];
  /** Team members stay anonymous to the client ("team"). */
  messages: PortalMessage[];
}

/** The contact's own submissions only; colleagues at the same client see nothing here. */
export async function listMyRequests(contact: PortalContact): Promise<MyRequestSummary[]> {
  const result = await query(`SELECT public_reference, title, status, archived_at, created_at FROM feature_requests
    WHERE submitter_contact_id = $1 AND client_account_id = $2 ORDER BY created_at DESC`, [contact.clientContactId, contact.clientAccountId]);
  return result.rows.map(row => ({
    reference: row.public_reference, title: row.title,
    status: toExternalStatus(row.status, !!row.archived_at), submittedAt: row.created_at.toISOString(),
  }));
}

/**
 * One of the contact's submissions as the client may see it: title, answers,
 * external status and dated history. Nothing internal (comments, scores,
 * assessments, assignee, tracker links) is selected at all.
 */
export async function getMyRequest(contact: PortalContact, reference: string): Promise<MyRequest | null> {
  const found = await query(`SELECT id, organization_id, public_reference, title, status, archived_at, created_at, form_answers
    FROM feature_requests WHERE public_reference = $1 AND submitter_contact_id = $2 AND client_account_id = $3`,
    [reference, contact.clientContactId, contact.clientAccountId]);
  const row = found.rows[0];
  if (!row) return null;
  const activity = await query(`SELECT created_at, action, metadata FROM activity_log
    WHERE request_id = $1 AND organization_id = $2
      AND (action IN ('STATUS_CHANGED', 'DECISION_MADE') OR (action = 'REQUEST_UPDATED' AND metadata ? 'archiveAction'))
    ORDER BY created_at, id`, [row.id, row.organization_id]);
  const events: StatusEvent[] = activity.rows.map(entry => {
    const at = entry.created_at.toISOString();
    const meta = entry.metadata ?? {};
    if (entry.action === 'DECISION_MADE') return { at, status: meta.targetStatus };
    if (entry.action === 'REQUEST_UPDATED') return meta.archiveAction === 'ARCHIVE' ? { at, archived: true } : { at, status: meta.preservedStatus };
    return { at, status: meta.to ?? meta.toStatus };
  });
  const thread = await query(`SELECT direction, body, created_at FROM request_external_messages
    WHERE request_id = $1 AND organization_id = $2 ORDER BY created_at, id`, [row.id, row.organization_id]);
  return {
    reference: row.public_reference, title: row.title, submittedAt: row.created_at.toISOString(),
    messages: thread.rows.map(m => ({ from: m.direction === 'TO_CLIENT' ? 'team' : 'you', body: m.body, at: m.created_at.toISOString() })),
    status: toExternalStatus(row.status, !!row.archived_at),
    answers: (row.form_answers ?? []).map((a: { label: string; value: string | number | null }) => ({ label: a.label, value: a.value })),
    history: projectHistory(row.created_at.toISOString(), events),
  };
}

/**
 * The contact answers on their own request. The team members who have written
 * on the thread (or subscribed) are notified; if none yet, reviewers are.
 */
export async function replyToMyRequest(contact: PortalContact, reference: string, rawBody: string): Promise<void> {
  const body = rawBody.trim();
  if (!body || body.length > 5000) throw new Error('Write a message of 1 to 5000 characters.');
  await transaction(async () => {
    const found = await query(`SELECT id, organization_id, title FROM feature_requests
      WHERE public_reference = $1 AND submitter_contact_id = $2 AND client_account_id = $3 FOR SHARE`,
      [reference, contact.clientContactId, contact.clientAccountId]);
    const request = found.rows[0];
    if (!request) throw new Error('Request not found.');
    await query(`INSERT INTO request_external_messages (request_id, organization_id, direction, author_contact_id, body)
      VALUES ($1, $2, 'FROM_CLIENT', $3, $4)`, [request.id, request.organization_id, contact.clientContactId, body]);
    await logActivity({ organizationId: request.organization_id, requestId: request.id, userId: contact.userId, action: 'CLIENT_MESSAGE',
      entityType: 'REQUEST', entityId: request.id, metadata: { direction: 'FROM_CLIENT' } });

    const involved = await query<{ user_id: string }>(`SELECT DISTINCT ou.user_id FROM organization_users ou
      WHERE ou.organization_id = $2 AND ou.user_id IN (
        SELECT author_user_id FROM request_external_messages WHERE request_id = $1 AND direction = 'TO_CLIENT'
        UNION SELECT user_id FROM request_subscriptions WHERE request_id = $1)`, [request.id, request.organization_id]);
    const recipients = involved.rows.length ? involved.rows.map(r => r.user_id)
      : (await getOrganizationUsers(request.organization_id)).filter(m => m.role === 'REVIEWER' || m.role === 'ADMIN').map(m => m.userId);
    for (const userId of recipients) {
      await notifyUser({ organizationId: request.organization_id, userId, type: 'COMMENT_ADDED', title: 'Client replied',
        message: `The client replied on "${request.title}"`, link: `/requests/${request.id}`, requestId: request.id, actorId: contact.userId });
    }
  });
}

async function receiptFor(orgId: string, requesterId: string, key: string): Promise<SubmissionResult | null> {
  const found = await query(`SELECT public_reference FROM feature_requests
    WHERE organization_id = $1 AND requester_id = $2 AND creation_key = $3`, [orgId, requesterId, key]);
  return found.rowCount ? { status: 'received', reference: found.rows[0].public_reference } : null;
}

async function notifyReviewers(orgId: string, requestId: string, title: string, actorId: string) {
  const members = await getOrganizationUsers(orgId);
  for (const member of members.filter(m => m.role === 'REVIEWER' || m.role === 'ADMIN')) {
    await notifyUser({ organizationId: orgId, userId: member.userId, type: 'REVIEW_NEEDED', title: 'New client request',
      message: `"${title}" was submitted through the client portal`, link: `/requests/${requestId}`, requestId, actorId });
  }
}

function newReference(): string {
  return Array.from({ length: 10 }, () => REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)]).join('');
}
