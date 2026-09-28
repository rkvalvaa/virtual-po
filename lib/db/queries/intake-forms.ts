import { query, transaction } from '@/lib/db/pool';
import { lockOrganizationAdmin } from '@/lib/auth/organization-admin';
import { definitionProblems, formDefinitionSchema, type FormDefinition } from '@/lib/forms/definition';
import { logActivity } from './activity-log';

export type IntakeFormStatus = 'DRAFT' | 'PUBLISHED' | 'PAUSED';
export interface IntakeForm {
  id: string;
  clientAccountId: string;
  clientName: string;
  status: IntakeFormStatus;
  version: number;
  publishedAt: string | null;
  draft: FormDefinition;
  published: FormDefinition | null;
}

export async function listForms(orgId: string): Promise<IntakeForm[]> {
  const result = await query(`SELECT f.id, f.client_account_id, a.name AS client_name, f.status, f.version,
      f.published_at, f.draft, f.published
    FROM intake_forms f JOIN client_accounts a ON a.id = f.client_account_id
    WHERE f.organization_id = $1 ORDER BY f.created_at`, [orgId]);
  return result.rows.map(row => ({
    id: row.id, clientAccountId: row.client_account_id, clientName: row.client_name, status: row.status,
    version: row.version, publishedAt: row.published_at?.toISOString() ?? null, draft: row.draft, published: row.published,
  }));
}

export async function createForm(orgId: string, actorId: string, clientAccountId: string, title: string): Promise<{ id: string }> {
  const draft = formDefinitionSchema.parse({ title, instructions: '', fields: [], titleFieldKey: null, maxAttachments: 3 });
  return transaction(async () => {
    await lockOrganizationAdmin(orgId, actorId);
    const client = await query(`SELECT 1 FROM client_accounts WHERE id = $1 AND organization_id = $2 AND archived_at IS NULL`,
      [clientAccountId, orgId]);
    if (!client.rowCount) throw new Error('Client not found.');
    const result = await query(`INSERT INTO intake_forms (organization_id, client_account_id, draft, created_by)
      VALUES ($1, $2, $3, $4) RETURNING id`, [orgId, clientAccountId, draft, actorId]);
    const id = result.rows[0].id;
    await formAudit(orgId, actorId, id, 'created', draft.title);
    return { id };
  });
}

/** Replace the draft. Throws the first rule an administrator must fix. */
export async function saveFormDraft(orgId: string, actorId: string, id: string, definition: FormDefinition): Promise<void> {
  const draft = formDefinitionSchema.parse(definition);
  const [problem] = definitionProblems(draft, { publish: false });
  if (problem) throw new Error(problem);
  await transaction(async () => {
    await lockOrganizationAdmin(orgId, actorId);
    const result = await query(`UPDATE intake_forms SET draft = $3, updated_at = NOW() WHERE organization_id = $1 AND id = $2`,
      [orgId, id, draft]);
    if (!result.rowCount) throw new Error('Form not found.');
    await formAudit(orgId, actorId, id, 'draft-saved', draft.title);
  });
}

/** Freeze the current draft as the next published version. */
export async function publishForm(orgId: string, actorId: string, id: string): Promise<void> {
  await transaction(async () => {
    await lockOrganizationAdmin(orgId, actorId);
    const current = await query(`SELECT draft FROM intake_forms WHERE organization_id = $1 AND id = $2 FOR UPDATE`, [orgId, id]);
    if (!current.rowCount) throw new Error('Form not found.');
    const draft = formDefinitionSchema.parse(current.rows[0].draft);
    const [problem] = definitionProblems(draft, { publish: true });
    if (problem) throw new Error(problem);
    await query(`UPDATE intake_forms SET published = draft, version = version + 1, status = 'PUBLISHED',
      published_by = $3, published_at = NOW(), updated_at = NOW() WHERE id = $2 AND organization_id = $1`, [orgId, id, actorId]);
    await formAudit(orgId, actorId, id, 'published', draft.title);
  });
}

/** Pause or resume a published form; the published version is unchanged. */
export async function setFormPaused(orgId: string, actorId: string, id: string, paused: boolean): Promise<void> {
  await transaction(async () => {
    await lockOrganizationAdmin(orgId, actorId);
    const result = await query(`UPDATE intake_forms SET status = $3, updated_at = NOW()
      WHERE organization_id = $1 AND id = $2 AND status = $4 RETURNING draft->>'title' AS title`,
      [orgId, id, paused ? 'PAUSED' : 'PUBLISHED', paused ? 'PUBLISHED' : 'PAUSED']);
    if (!result.rowCount) throw new Error('Form not found.');
    await formAudit(orgId, actorId, id, paused ? 'paused' : 'resumed', result.rows[0].title);
  });
}

async function formAudit(orgId: string, actorId: string, formId: string, operation: string, title: string) {
  await logActivity({ organizationId: orgId, userId: actorId, action: 'FORM_UPDATED', entityType: 'ORGANIZATION', entityId: orgId, metadata: { operation, formId, title } });
}
