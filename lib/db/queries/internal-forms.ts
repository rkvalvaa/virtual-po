import { query, transaction } from '@/lib/db/pool';
import { formDefinitionSchema, summarizeAnswers, validateAnswers, type FormDefinition } from '@/lib/forms/definition';
import { CURRENT_CHANGE_WORKFLOW_VERSION, changeWorkflow } from '@/lib/workflows/change-request';
import type { RawCustomFieldValues } from '@/lib/utils/custom-fields';
import { logActivity } from './activity-log';
import { notifyUser } from './notifications';

/**
 * Internal forms, filed by workspace members. What a submission creates (its
 * organization, CHANGE type and service group) comes from the form row only.
 */

export interface InternalForm { id: string; title: string; groupName: string; organizationName: string; definition: FormDefinition }
export type InternalSubmission =
  | { status: 'received'; requestId: string }
  | { status: 'invalid'; errors: Record<string, string> };

const PUBLISHED_INTERNAL = `f.audience = 'INTERNAL' AND f.status = 'PUBLISHED' AND g.archived_at IS NULL`;

export async function listInternalForms(orgId: string): Promise<{ id: string; title: string; groupName: string }[]> {
  const result = await query(`SELECT f.id, f.published->>'title' AS title, g.name AS group_name FROM intake_forms f
    JOIN service_groups g ON g.id = f.service_group_id
    WHERE f.organization_id = $1 AND ${PUBLISHED_INTERNAL} ORDER BY lower(f.published->>'title')`, [orgId]);
  return result.rows.map(row => ({ id: row.id, title: row.title, groupName: row.group_name }));
}

export async function getInternalForm(orgId: string, formId: string): Promise<InternalForm | null> {
  const result = await query(`SELECT f.id, f.published, g.name AS group_name, o.name AS organization_name FROM intake_forms f
    JOIN service_groups g ON g.id = f.service_group_id JOIN organizations o ON o.id = f.organization_id
    WHERE f.id = $1 AND f.organization_id = $2 AND ${PUBLISHED_INTERNAL}`, [formId, orgId]);
  const row = result.rows[0];
  if (!row) return null;
  const definition = formDefinitionSchema.parse(row.published);
  return { id: row.id, title: definition.title, groupName: row.group_name, organizationName: row.organization_name, definition };
}

/** File a change request from a published internal form. A retried submission (same key) returns the same request. */
export async function submitInternalRequest(params: {
  orgId: string; userId: string; formId: string; submissionKey: string; answers: RawCustomFieldValues;
}): Promise<InternalSubmission> {
  const { orgId, userId, formId, submissionKey } = params;
  return transaction(async () => {
    const form = await query(`SELECT f.version, f.published, f.service_group_id, g.fallback_owner_id FROM intake_forms f
      JOIN service_groups g ON g.id = f.service_group_id
      JOIN organization_users m ON m.organization_id = f.organization_id AND m.user_id = $3
      WHERE f.id = $1 AND f.organization_id = $2 AND ${PUBLISHED_INTERNAL} FOR SHARE OF f, g`, [formId, orgId, userId]);
    if (!form.rowCount) throw new Error('Form not found.');
    const { version, service_group_id: groupId } = form.rows[0];

    const earlier = await requestFor(orgId, userId, submissionKey);
    if (earlier) return earlier;

    const definition = formDefinitionSchema.parse(form.rows[0].published);
    const validation = validateAnswers(definition, params.answers);
    if (!validation.ok) return { status: 'invalid', errors: validation.errors };
    const { title, summary, snapshot } = summarizeAnswers(definition, validation.values);
    const workflow = changeWorkflow(CURRENT_CHANGE_WORKFLOW_VERSION);

    const inserted = await query(`INSERT INTO feature_requests (organization_id, requester_id, title, summary, request_type,
        workflow_version, workflow_state, service_group_id, creation_key, source_form_id, source_form_version, form_answers)
      VALUES ($1, $2, $3, $4, 'CHANGE', $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (organization_id, requester_id, creation_key) WHERE creation_key IS NOT NULL DO NOTHING
      RETURNING id`,
      [orgId, userId, title, summary, workflow.version, workflow.initial, groupId, submissionKey, formId, version, JSON.stringify(snapshot)]);
    if (!inserted.rowCount) return (await requestFor(orgId, userId, submissionKey))!;

    const requestId = inserted.rows[0].id;
    await logActivity({ organizationId: orgId, requestId, userId, action: 'REQUEST_CREATED', entityType: 'REQUEST', entityId: requestId,
      metadata: { source: 'internal-form', formId, formVersion: version, serviceGroupId: groupId, workflowVersion: workflow.version } });
    await notifyGroup(orgId, groupId, form.rows[0].fallback_owner_id, requestId, title, userId);
    return { status: 'received', requestId };
  });
}

async function requestFor(orgId: string, requesterId: string, key: string): Promise<InternalSubmission | null> {
  const found = await query(`SELECT id FROM feature_requests
    WHERE organization_id = $1 AND requester_id = $2 AND creation_key = $3`, [orgId, requesterId, key]);
  return found.rowCount ? { status: 'received', requestId: found.rows[0].id } : null;
}

/** The group's leads and its fallback owner hear about a new change request. */
async function notifyGroup(orgId: string, groupId: string, fallbackOwnerId: string, requestId: string, title: string, actorId: string) {
  const leads = await query<{ user_id: string }>(`SELECT user_id FROM service_group_members WHERE group_id = $1 AND role = 'LEAD'`, [groupId]);
  const recipients = new Set([fallbackOwnerId, ...leads.rows.map(r => r.user_id)]);
  for (const userId of recipients) {
    await notifyUser({ organizationId: orgId, userId, type: 'REVIEW_NEEDED', title: 'New change request',
      message: `"${title}" was submitted to your service group.`, link: `/requests/${requestId}`, requestId, actorId });
  }
}
