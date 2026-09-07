import type {
  CustomFieldDefinition,
  CustomFieldValues,
} from '@/lib/types/database';

/** Raw values as they arrive from a form: everything is a string or absent. */
export type RawCustomFieldValues = Record<string, string | number | null | undefined>;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Derive a stable storage key from a field's display name:
 * lowercased, non-alphanumerics collapsed to underscores.
 *
 * Returns '' when the name has no usable characters — callers must reject that.
 */
export function slugifyFieldKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64)
    .replace(/_+$/, '');
}

export interface CustomFieldValidation {
  ok: boolean;
  /** Per-field messages, keyed by definition key. Empty when `ok`. */
  errors: Record<string, string>;
  /**
   * The values to persist: one entry per definition (unset fields are null),
   * NUMBER fields coerced to numbers. Unknown keys in the input are dropped.
   */
  values: CustomFieldValues;
}

function isEmpty(value: string | number | null | undefined): boolean {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

/**
 * Validate submitted custom field values against an organization's definitions.
 *
 * Unset optional fields are stored as null. Values for keys with no matching
 * definition are ignored rather than rejected, so deleting a definition does
 * not break in-flight edits.
 */
export function validateCustomFieldValues(
  definitions: CustomFieldDefinition[],
  values: RawCustomFieldValues
): CustomFieldValidation {
  const errors: Record<string, string> = {};
  const cleaned: CustomFieldValues = {};

  for (const def of definitions) {
    const raw = values[def.key];

    if (isEmpty(raw)) {
      if (def.required) errors[def.key] = `${def.name} is required`;
      cleaned[def.key] = null;
      continue;
    }

    const text = typeof raw === 'string' ? raw.trim() : String(raw);

    switch (def.type) {
      case 'NUMBER': {
        const num = Number(text);
        if (!Number.isFinite(num)) {
          errors[def.key] = `${def.name} must be a number`;
          cleaned[def.key] = null;
        } else {
          cleaned[def.key] = num;
        }
        break;
      }
      case 'SELECT': {
        if (!def.options.includes(text)) {
          errors[def.key] = `${def.name} must be one of: ${def.options.join(', ')}`;
          cleaned[def.key] = null;
        } else {
          cleaned[def.key] = text;
        }
        break;
      }
      case 'DATE': {
        // Round-trip through Date so overflow dates (2026-02-30) are rejected,
        // not silently rolled forward the way Date parsing does.
        const parsed = new Date(text);
        const valid =
          DATE_PATTERN.test(text) &&
          !Number.isNaN(parsed.getTime()) &&
          parsed.toISOString().slice(0, 10) === text;
        if (!valid) {
          errors[def.key] = `${def.name} must be a date (YYYY-MM-DD)`;
          cleaned[def.key] = null;
        } else {
          cleaned[def.key] = text;
        }
        break;
      }
      default:
        cleaned[def.key] = text;
    }
  }

  return { ok: Object.keys(errors).length === 0, errors, values: cleaned };
}

/** Render a stored value for display or CSV export. */
export function formatCustomFieldValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value);
}
