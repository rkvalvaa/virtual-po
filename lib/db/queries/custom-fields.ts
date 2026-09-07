import { query } from '@/lib/db/pool';
import { mapRow, mapRows } from '@/lib/db/mappers';
import { slugifyFieldKey } from '@/lib/utils/custom-fields';
import type {
  CustomFieldDefinition,
  CustomFieldType,
  CustomFieldValues,
  FeatureRequest,
} from '@/lib/types/database';

export async function listCustomFieldDefinitions(
  orgId: string
): Promise<CustomFieldDefinition[]> {
  const result = await query(
    `SELECT * FROM custom_field_definitions
     WHERE organization_id = $1
     ORDER BY sort_order ASC, name ASC`,
    [orgId]
  );
  return mapRows<CustomFieldDefinition>(result.rows);
}

/**
 * Create a definition. The storage key is derived from the name and is
 * immutable afterwards, so renaming a field never orphans stored values.
 * New fields sort to the end of the list.
 */
export async function createCustomFieldDefinition(params: {
  organizationId: string;
  name: string;
  type: CustomFieldType;
  options?: string[];
  required?: boolean;
}): Promise<CustomFieldDefinition> {
  const key = slugifyFieldKey(params.name);
  if (!key) throw new Error('Field name must contain at least one letter or number');

  const result = await query(
    `INSERT INTO custom_field_definitions
       (organization_id, name, key, type, options, required, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6,
       COALESCE((SELECT MAX(sort_order) + 1 FROM custom_field_definitions WHERE organization_id = $1), 0))
     RETURNING *`,
    [
      params.organizationId,
      params.name,
      key,
      params.type,
      JSON.stringify(params.type === 'SELECT' ? (params.options ?? []) : []),
      params.required ?? false,
    ]
  );
  return mapRow<CustomFieldDefinition>(result.rows[0]);
}

export async function updateCustomFieldDefinition(
  id: string,
  orgId: string,
  params: {
    name?: string;
    options?: string[];
    required?: boolean;
    sortOrder?: number;
  }
): Promise<CustomFieldDefinition | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  if (params.name !== undefined) {
    fields.push(`name = $${idx++}`);
    values.push(params.name);
  }
  if (params.options !== undefined) {
    fields.push(`options = $${idx++}`);
    values.push(JSON.stringify(params.options));
  }
  if (params.required !== undefined) {
    fields.push(`required = $${idx++}`);
    values.push(params.required);
  }
  if (params.sortOrder !== undefined) {
    fields.push(`sort_order = $${idx++}`);
    values.push(params.sortOrder);
  }

  if (fields.length === 0) {
    const existing = await query(
      `SELECT * FROM custom_field_definitions WHERE id = $1 AND organization_id = $2`,
      [id, orgId]
    );
    return existing.rows.length > 0
      ? mapRow<CustomFieldDefinition>(existing.rows[0])
      : null;
  }

  values.push(id, orgId);
  const result = await query(
    `UPDATE custom_field_definitions SET ${fields.join(', ')}
     WHERE id = $${idx++} AND organization_id = $${idx}
     RETURNING *`,
    values
  );
  return result.rows.length > 0 ? mapRow<CustomFieldDefinition>(result.rows[0]) : null;
}

export async function deleteCustomFieldDefinition(
  id: string,
  orgId: string
): Promise<boolean> {
  // ponytail: stored values for the deleted key stay in feature_requests.custom_fields
  // and are simply not rendered. Backfill them out if orphaned data ever matters.
  const result = await query(
    `DELETE FROM custom_field_definitions WHERE id = $1 AND organization_id = $2`,
    [id, orgId]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Replace a request's custom field values. Caller must validate them against
 * the org's definitions first (see validateCustomFieldValues).
 */
export async function updateRequestCustomFields(
  requestId: string,
  orgId: string,
  values: CustomFieldValues
): Promise<FeatureRequest | null> {
  const result = await query(
    `UPDATE feature_requests
     SET custom_fields = $1::jsonb, updated_at = NOW()
     WHERE id = $2 AND organization_id = $3
     RETURNING *`,
    [JSON.stringify(values), requestId, orgId]
  );
  return result.rows.length > 0 ? mapRow<FeatureRequest>(result.rows[0]) : null;
}
