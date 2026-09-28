"use client"

import { useId, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { FormDefinition, FormField } from '@/lib/forms/definition';

const inputClass = 'w-full rounded-md border bg-background p-2 text-sm';

/**
 * A published request form as a client sees it. Settings renders the same
 * component as its preview, so what an administrator checks is what ships.
 */
export function RequestForm({ definition, organizationName, preview, action, errors, pending, children }: {
  definition: FormDefinition;
  organizationName: string;
  preview?: boolean;
  action?: (formData: FormData) => void;
  errors?: Record<string, string>;
  pending?: boolean;
  children?: ReactNode;
}) {
  const idPrefix = useId();
  const [values, setValues] = useState<Record<string, string>>({});
  const shown = visibleFields(definition.fields, values);

  return <form className="space-y-4" action={preview ? undefined : action} onSubmit={preview ? event => event.preventDefault() : undefined}>
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{organizationName}</p>
      <h2 className="text-lg font-semibold">{definition.title}</h2>
      {definition.instructions && <p className="whitespace-pre-line text-sm text-muted-foreground">{definition.instructions}</p>}
    </div>
    {shown.map(field => {
      const id = `${idPrefix}-${field.key}`;
      const set = (value: string) => setValues(current => ({ ...current, [field.key]: value }));
      return <div key={field.key} className="space-y-1">
        <label htmlFor={id} className="text-sm font-medium">{field.label}{field.required ? ' *' : ''}</label>
        <FieldInput id={id} field={field} value={values[field.key] ?? ''} onChange={set} />
        {errors?.[field.key] && <p className="text-sm text-destructive">{errors[field.key]}</p>}
      </div>;
    })}
    {children}
    <Button type="submit" disabled={preview || pending}>Submit request</Button>
  </form>;
}

function FieldInput({ id, field, value, onChange }: { id: string; field: FormField; value: string; onChange: (value: string) => void }) {
  const common = { id, name: field.key, required: field.required, value };
  switch (field.type) {
    case 'LONG_TEXT': return <Textarea {...common} maxLength={5000} onChange={e => onChange(e.target.value)} />;
    case 'NUMBER': return <Input {...common} type="number" onChange={e => onChange(e.target.value)} />;
    case 'DATE': return <Input {...common} type="date" onChange={e => onChange(e.target.value)} />;
    case 'SELECT': return <select {...common} className={inputClass} onChange={e => onChange(e.target.value)}>
      <option value="">Choose…</option>
      {field.options.map(option => <option key={option} value={option}>{option}</option>)}
    </select>;
    default: return <Input {...common} maxLength={500} onChange={e => onChange(e.target.value)} />;
  }
}

/** Mirrors validateAnswers: a field shows when the field it depends on has the chosen value. */
function visibleFields(fields: FormField[], values: Record<string, string>): FormField[] {
  const shown = new Set<string>();
  return fields.filter(field => {
    const visible = !field.showIf || (shown.has(field.showIf.fieldKey) && values[field.showIf.fieldKey]?.trim() === field.showIf.equals);
    if (visible) shown.add(field.key);
    return visible;
  });
}
