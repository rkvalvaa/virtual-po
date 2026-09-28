import { z } from 'zod';
import type { CustomFieldValues } from '@/lib/types/database';
import { validateCustomFieldValues, type RawCustomFieldValues } from '@/lib/utils/custom-fields';

export const FORM_FIELD_TYPES = ['TEXT', 'LONG_TEXT', 'NUMBER', 'SELECT', 'DATE'] as const;
export type FormFieldType = typeof FORM_FIELD_TYPES[number];

const MAX_LENGTH: Partial<Record<FormFieldType, number>> = { TEXT: 500, LONG_TEXT: 5000 };

const formFieldSchema = z.object({
  key: z.string().regex(/^[a-z0-9_]{1,64}$/, 'Field keys use lowercase letters, digits and underscores.'),
  label: z.string().trim().min(1).max(120),
  type: z.enum(FORM_FIELD_TYPES),
  required: z.boolean(),
  options: z.array(z.string().trim().min(1).max(80)).max(30),
  showIf: z.object({ fieldKey: z.string(), equals: z.string().trim().min(1).max(80) }).nullable(),
});

/** Shape only; cross-field rules live in definitionProblems. */
export const formDefinitionSchema = z.object({
  title: z.string().trim().min(1).max(120),
  instructions: z.string().trim().max(2000),
  fields: z.array(formFieldSchema).max(30),
  titleFieldKey: z.string().nullable(),
  maxAttachments: z.number().int().min(0).max(10),
});

export type FormField = z.infer<typeof formFieldSchema>;
export type FormDefinition = z.infer<typeof formDefinitionSchema>;

/**
 * Cross-field rules, as messages an administrator can act on. A draft may be
 * incomplete (no fields, no title field); a published form may not.
 */
export function definitionProblems(definition: FormDefinition, { publish }: { publish: boolean }): string[] {
  const problems: string[] = [];
  const { fields } = definition;

  const duplicates = [...new Set(fields.map(f => f.key).filter((key, i, keys) => keys.indexOf(key) !== i))];
  if (duplicates.length) problems.push(`Field keys must be unique: ${duplicates.join(', ')}.`);

  fields.forEach((field, index) => {
    if (field.type === 'SELECT' && !field.options.length) problems.push(`${field.label} needs at least one option.`);
    if (!field.showIf) return;
    const source = fields.slice(0, index).find(f => f.key === field.showIf!.fieldKey);
    if (!source) problems.push(`${field.label} can only depend on a field above it.`);
    else if (source.type === 'SELECT' && !source.options.includes(field.showIf.equals)) {
      problems.push(`${field.label} depends on a value ${source.label} does not offer.`);
    }
  });

  if (publish) {
    if (!fields.length) problems.push('Add at least one field.');
    const titleField = fields.find(f => f.key === definition.titleFieldKey);
    if (!titleField || titleField.type !== 'TEXT' || !titleField.required || titleField.showIf) {
      problems.push('The request title must come from a required, always-shown short text field.');
    }
  }
  return problems;
}

export interface AnswerValidation { ok: boolean; errors: Record<string, string>; values: CustomFieldValues }

/**
 * Validate submitted answers against a published definition. Fields hidden by
 * their condition are dropped (and so never required); unknown keys are ignored.
 */
export function validateAnswers(definition: FormDefinition, raw: RawCustomFieldValues): AnswerValidation {
  const errors: Record<string, string> = {};
  const values: CustomFieldValues = {};
  for (const field of definition.fields) {
    // Conditions only reference earlier fields, so their cleaned value is known.
    if (field.showIf && values[field.showIf.fieldKey] !== field.showIf.equals) continue;
    const type = field.type === 'LONG_TEXT' ? 'TEXT' : field.type;
    const result = validateCustomFieldValues([{ key: field.key, name: field.label, type, options: field.options, required: field.required }], raw);
    const value = result.values[field.key];
    const limit = MAX_LENGTH[field.type];
    if (result.errors[field.key]) errors[field.key] = result.errors[field.key];
    else if (limit && typeof value === 'string' && value.length > limit) errors[field.key] = `${field.label} must be at most ${limit} characters`;
    values[field.key] = value;
  }
  return { ok: Object.keys(errors).length === 0, errors, values };
}
