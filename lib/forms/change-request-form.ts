import type { FormDefinition } from './definition';

/** Starting draft for a new internal form; admins edit it before publishing. */
export function defaultChangeRequestForm(title: string): FormDefinition {
  const field = (key: string, label: string, type: 'TEXT' | 'LONG_TEXT' | 'DATE', required: boolean) =>
    ({ key, label, type, required, options: [], showIf: null });
  return {
    title,
    instructions: 'Describe the change and why it is needed. Attach files on the request page after you submit.',
    titleFieldKey: 'summary',
    maxAttachments: 0,
    fields: [
      field('summary', 'Change summary', 'TEXT', true),
      field('affected', 'Affected product, service or client', 'TEXT', true),
      field('reason', 'Reason for the change', 'LONG_TEXT', true),
      field('scope', 'Scope', 'LONG_TEXT', true),
      field('impact', 'Impact and risk', 'LONG_TEXT', true),
      field('requested_timing', 'Requested timing', 'DATE', false),
      field('cost', 'Estimated cost', 'TEXT', false),
    ],
  };
}
