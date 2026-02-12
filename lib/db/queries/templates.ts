import { query } from '@/lib/db/pool';
import { mapRow, mapRows } from '@/lib/db/mappers';
import type { RequestTemplate, TemplateCategory } from '@/lib/types/database';

export async function getActiveTemplates(orgId: string): Promise<RequestTemplate[]> {
  const result = await query(
    `SELECT * FROM request_templates
     WHERE organization_id = $1 AND is_active = true
     ORDER BY sort_order ASC, name ASC`,
    [orgId]
  );
  return mapRows<RequestTemplate>(result.rows);
}

export async function getAllTemplates(orgId: string): Promise<RequestTemplate[]> {
  const result = await query(
    `SELECT * FROM request_templates
     WHERE organization_id = $1
     ORDER BY sort_order ASC, name ASC`,
    [orgId]
  );
  return mapRows<RequestTemplate>(result.rows);
}

export async function getTemplateById(id: string): Promise<RequestTemplate | null> {
  const result = await query(
    `SELECT * FROM request_templates WHERE id = $1`,
    [id]
  );
  if (result.rows.length === 0) return null;
  return mapRow<RequestTemplate>(result.rows[0]);
}

export async function createTemplate(params: {
  organizationId: string;
  name: string;
  description?: string;
  category: TemplateCategory;
  icon?: string;
  defaultTitle?: string;
  promptHints?: string[];
  sortOrder?: number;
}): Promise<RequestTemplate> {
  const result = await query(
    `INSERT INTO request_templates (organization_id, name, description, category, icon, default_title, prompt_hints, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      params.organizationId,
      params.name,
      params.description ?? null,
      params.category,
      params.icon ?? null,
      params.defaultTitle ?? null,
      JSON.stringify(params.promptHints ?? []),
      params.sortOrder ?? 0,
    ]
  );
  return mapRow<RequestTemplate>(result.rows[0]);
}

export async function updateTemplate(
  id: string,
  params: {
    name?: string;
    description?: string | null;
    category?: TemplateCategory;
    icon?: string | null;
    defaultTitle?: string | null;
    promptHints?: string[];
    isActive?: boolean;
    sortOrder?: number;
  }
): Promise<RequestTemplate> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (params.name !== undefined) { fields.push(`name = $${idx++}`); values.push(params.name); }
  if (params.description !== undefined) { fields.push(`description = $${idx++}`); values.push(params.description); }
  if (params.category !== undefined) { fields.push(`category = $${idx++}`); values.push(params.category); }
  if (params.icon !== undefined) { fields.push(`icon = $${idx++}`); values.push(params.icon); }
  if (params.defaultTitle !== undefined) { fields.push(`default_title = $${idx++}`); values.push(params.defaultTitle); }
  if (params.promptHints !== undefined) { fields.push(`prompt_hints = $${idx++}`); values.push(JSON.stringify(params.promptHints)); }
  if (params.isActive !== undefined) { fields.push(`is_active = $${idx++}`); values.push(params.isActive); }
  if (params.sortOrder !== undefined) { fields.push(`sort_order = $${idx++}`); values.push(params.sortOrder); }

  values.push(id);
  const result = await query(
    `UPDATE request_templates SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );
  return mapRow<RequestTemplate>(result.rows[0]);
}

export async function deleteTemplate(id: string): Promise<void> {
  await query(`DELETE FROM request_templates WHERE id = $1`, [id]);
}

export async function seedDefaultTemplates(orgId: string): Promise<void> {
  const existing = await query(
    `SELECT COUNT(*) AS count FROM request_templates WHERE organization_id = $1`,
    [orgId]
  );
  if (parseInt(existing.rows[0].count, 10) > 0) return;

  const defaults = [
    {
      name: 'Bug Fix',
      description: 'Report a bug or defect that needs to be fixed',
      category: 'BUG_FIX',
      icon: 'bug',
      defaultTitle: 'Bug: ',
      promptHints: ['Describe the bug and steps to reproduce', 'What is the expected behavior?', 'How severe is the impact?'],
      sortOrder: 1,
    },
    {
      name: 'New Feature',
      description: 'Request a brand new feature or capability',
      category: 'NEW_FEATURE',
      icon: 'sparkles',
      defaultTitle: '',
      promptHints: ['What problem does this feature solve?', 'Who are the primary users?', 'Are there any examples or competitors with this feature?'],
      sortOrder: 2,
    },
    {
      name: 'Improvement',
      description: 'Suggest an enhancement to an existing feature',
      category: 'IMPROVEMENT',
      icon: 'trending-up',
      defaultTitle: 'Improve: ',
      promptHints: ['Which existing feature needs improvement?', 'What are the current pain points?', 'What does the ideal experience look like?'],
      sortOrder: 3,
    },
    {
      name: 'Integration Request',
      description: 'Request a new integration or connection with an external system',
      category: 'INTEGRATION',
      icon: 'plug',
      defaultTitle: 'Integration: ',
      promptHints: ['Which system or service should we integrate with?', 'What data needs to flow between systems?', 'Are there API docs or specifications available?'],
      sortOrder: 4,
    },
  ];

  for (const tmpl of defaults) {
    await query(
      `INSERT INTO request_templates (organization_id, name, description, category, icon, default_title, prompt_hints, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [orgId, tmpl.name, tmpl.description, tmpl.category, tmpl.icon, tmpl.defaultTitle, JSON.stringify(tmpl.promptHints), tmpl.sortOrder]
    );
  }
}
