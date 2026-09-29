"use client"

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RequestForm } from '@/components/portal/RequestForm';
import { manageForms } from '@/app/(dashboard)/settings/form-actions';
import { FORM_FIELD_TYPES, type FormDefinition, type FormField } from '@/lib/forms/definition';
import type { IntakeForm } from '@/lib/db/queries/intake-forms';
import { slugifyFieldKey } from '@/lib/utils/custom-fields';

const selectClass = 'w-full max-w-full rounded-md border bg-background p-2 text-sm';
const TYPE_LABELS: Record<FormField['type'], string> = { TEXT: 'Short text', LONG_TEXT: 'Long text', NUMBER: 'Number', SELECT: 'Choice', DATE: 'Date' };

type LinearTeamChoice = { id: string; name: string; projects: { id: string; name: string }[] };

export function FormSettings({ forms, clients, groups = [], linearTeams = null, organizationName }: {
  forms: IntakeForm[]; clients: { id: string; name: string }[]; groups?: { id: string; name: string }[];
  /** Teams and projects of the connected Linear account; null when Linear is not connected or could not be reached. */
  linearTeams?: LinearTeamChoice[] | null; organizationName: string
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<string | null>(null);

  function run(...inputs: unknown[]) {
    setError('');
    startTransition(async () => {
      try {
        for (const input of inputs) {
          const result = await manageForms(input);
          if (!result.success) { setError(result.error ?? 'Unable to update the form.'); break; }
        }
        router.refresh();
      } catch { setError('Unable to update the form. Try again.'); }
    });
  }

  return <Card>
    <CardHeader><CardTitle>Request forms</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <p className="text-sm text-muted-foreground">A client form is published to one client. An internal form lets workspace members file change requests into a service group. Publishing freezes a version; later edits stay in the draft until you publish again.</p>
      {!clients.length ? <p className="text-sm text-muted-foreground">Add a client under Clients before creating a form.</p> :
        <form className="flex flex-wrap items-end gap-2" onSubmit={event => {
          event.preventDefault(); const data = new FormData(event.currentTarget);
          run({ kind: 'create', clientAccountId: String(data.get('client')), title: String(data.get('title')).trim() });
          event.currentTarget.reset();
        }}>
          <div className="min-w-0 flex-1"><label htmlFor="new-form-title" className="text-sm">Form title</label><Input id="new-form-title" name="title" required maxLength={120} disabled={pending} /></div>
          <div className="min-w-0 max-w-full"><label htmlFor="new-form-client" className="block text-sm">Client</label>
            <select id="new-form-client" name="client" required className={selectClass} disabled={pending} defaultValue="">
              <option value="" disabled>Choose a client</option>
              {clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}
            </select></div>
          <Button type="submit" disabled={pending}>Create form</Button>
        </form>}
      {groups.length > 0 && <form className="flex flex-wrap items-end gap-2" onSubmit={event => {
          event.preventDefault(); const data = new FormData(event.currentTarget);
          run({ kind: 'createInternal', serviceGroupId: String(data.get('group')), title: String(data.get('title')).trim() });
          event.currentTarget.reset();
        }}>
          <div className="min-w-0 flex-1"><label htmlFor="new-internal-form-title" className="text-sm">Internal form title</label><Input id="new-internal-form-title" name="title" required maxLength={120} disabled={pending} /></div>
          <div className="min-w-0 max-w-full"><label htmlFor="new-internal-form-group" className="block text-sm">Service group</label>
            <select id="new-internal-form-group" name="group" required className={selectClass} disabled={pending} defaultValue="">
              <option value="" disabled>Choose a group</option>
              {groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
            </select></div>
          <Button type="submit" disabled={pending}>Create internal form</Button>
        </form>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!forms.length && <p className="text-sm text-muted-foreground">No forms yet.</p>}
      {forms.map(form => <div key={form.id} className="space-y-3 border-t pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm"><span className="font-medium">{form.draft.title}</span> · {form.audience === 'INTERNAL' ? `Internal · ${form.serviceGroupName} · change requests` : form.clientName} · {statusLabel(form)}</p>
          <Button variant="outline" size="sm" onClick={() => setEditing(editing === form.id ? null : form.id)}>{editing === form.id ? `Close ${form.draft.title}` : `Edit ${form.draft.title}`}</Button>
        </div>
        {editing === form.id && <FormEditor form={form} organizationName={organizationName} pending={pending} run={run} linearTeams={linearTeams} />}
      </div>)}
    </CardContent>
  </Card>;
}

function statusLabel(form: IntakeForm): string {
  if (form.status === 'DRAFT') return 'Draft, not published';
  return `${form.status === 'PAUSED' ? 'Paused' : 'Published'} (version ${form.version})`;
}

interface Row { field: FormField; isNew: boolean; optionsText: string }

function FormEditor({ form, organizationName, pending, run, linearTeams }: {
  form: IntakeForm; organizationName: string; pending: boolean; run: (...inputs: unknown[]) => void; linearTeams: LinearTeamChoice[] | null
}) {
  const [meta, setMeta] = useState({ title: form.draft.title, instructions: form.draft.instructions, titleFieldKey: form.draft.titleFieldKey, maxAttachments: form.draft.maxAttachments });
  const [rows, setRows] = useState<Row[]>(form.draft.fields.map(field => ({ field, isNew: false, optionsText: field.options.join(', ') })));
  const internal = form.audience === 'INTERNAL';

  const definition: FormDefinition = {
    ...meta,
    fields: rows.map(row => ({ ...row.field, options: row.field.type === 'SELECT' ? splitOptions(row.optionsText) : [] })),
  };
  const update = (index: number, change: (row: Row) => Row) => setRows(current => current.map((row, i) => i === index ? change(row) : row));
  const relabel = (index: number, label: string) => update(index, row => ({
    ...row,
    field: { ...row.field, label, key: row.isNew ? uniqueKey(label, rows.filter((_, i) => i !== index).map(r => r.field.key)) : row.field.key },
  }));

  return <div className="space-y-4 rounded-md border p-3">
    <div><label htmlFor={`title-${form.id}`} className="text-sm">Title shown to {internal ? 'members' : 'clients'}</label>
      <Input id={`title-${form.id}`} value={meta.title} maxLength={120} onChange={e => setMeta({ ...meta, title: e.target.value })} /></div>
    <div><label htmlFor={`instructions-${form.id}`} className="text-sm">Instructions</label>
      <Textarea id={`instructions-${form.id}`} value={meta.instructions} maxLength={2000} onChange={e => setMeta({ ...meta, instructions: e.target.value })} /></div>
    {internal
      ? <p className="text-sm text-muted-foreground">Members attach files on the request page after they submit.</p>
      : <div><label htmlFor={`attachments-${form.id}`} className="text-sm">Attachments allowed (0–10)</label>
        <Input id={`attachments-${form.id}`} type="number" min={0} max={10} value={meta.maxAttachments} onChange={e => setMeta({ ...meta, maxAttachments: Number(e.target.value) })} /></div>}

    {rows.map((row, index) => {
      const n = index + 1;
      const earlier = rows.slice(0, index).map(r => r.field);
      return <fieldset key={index} className="space-y-2 rounded-md border p-2">
        <legend className="px-1 text-xs text-muted-foreground">Field {n}{row.field.key ? ` · ${row.field.key}` : ''}</legend>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1"><label htmlFor={`label-${form.id}-${n}`} className="text-sm">Label for field {n}</label>
            <Input id={`label-${form.id}-${n}`} value={row.field.label} maxLength={120} onChange={e => relabel(index, e.target.value)} /></div>
          <div className="min-w-0 max-w-full"><label htmlFor={`type-${form.id}-${n}`} className="block text-sm">Type for field {n}</label>
            <select id={`type-${form.id}-${n}`} className={selectClass} value={row.field.type} onChange={e => update(index, r => ({ ...r, field: { ...r.field, type: e.target.value as FormField['type'] } }))}>
              {FORM_FIELD_TYPES.map(type => <option key={type} value={type}>{TYPE_LABELS[type]}</option>)}
            </select></div>
          <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={row.field.required} onChange={e => update(index, r => ({ ...r, field: { ...r.field, required: e.target.checked } }))} /> Required for field {n}</label>
        </div>
        {row.field.type === 'SELECT' && <div><label htmlFor={`options-${form.id}-${n}`} className="text-sm">Options for field {n} (comma separated)</label>
          <Input id={`options-${form.id}-${n}`} value={row.optionsText} onChange={e => update(index, r => ({ ...r, optionsText: e.target.value }))} /></div>}
        {earlier.length > 0 && <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 max-w-full"><label htmlFor={`if-${form.id}-${n}`} className="block text-sm">Show field {n} only when</label>
            <select id={`if-${form.id}-${n}`} className={selectClass} value={row.field.showIf?.fieldKey ?? ''}
              onChange={e => update(index, r => ({ ...r, field: { ...r.field, showIf: e.target.value ? { fieldKey: e.target.value, equals: r.field.showIf?.equals ?? '' } : null } }))}>
              <option value="">Always show</option>
              {earlier.map(f => <option key={f.key} value={f.key}>{f.label || f.key}</option>)}
            </select></div>
          {row.field.showIf && <div className="min-w-0 flex-1"><label htmlFor={`equals-${form.id}-${n}`} className="text-sm">equals (condition value for field {n})</label>
            <Input id={`equals-${form.id}-${n}`} value={row.field.showIf.equals} onChange={e => update(index, r => ({ ...r, field: { ...r.field, showIf: { fieldKey: r.field.showIf!.fieldKey, equals: e.target.value } } }))} /></div>}
        </div>}
        <Button type="button" variant="outline" size="sm" onClick={() => setRows(current => current.filter((_, i) => i !== index))}>Remove field {n}</Button>
      </fieldset>;
    })}
    <Button type="button" variant="outline" size="sm" onClick={() => setRows(current => [...current, { field: { key: '', label: '', type: 'TEXT', required: false, options: [], showIf: null }, isNew: true, optionsText: '' }])}>Add field</Button>

    {internal && <DestinationPicker form={form} teams={linearTeams} pending={pending} run={run} />}

    <div className="min-w-0 max-w-full"><label htmlFor={`title-field-${form.id}`} className="block text-sm">Request title comes from</label>
      <select id={`title-field-${form.id}`} className={selectClass} value={meta.titleFieldKey ?? ''} onChange={e => setMeta({ ...meta, titleFieldKey: e.target.value || null })}>
        <option value="">Choose a required short text field</option>
        {definition.fields.filter(f => f.type === 'TEXT' && f.key).map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
      </select></div>

    <div className="flex flex-wrap gap-2">
      <Button type="button" disabled={pending} onClick={() => run({ kind: 'saveDraft', id: form.id, definition })}>Save draft</Button>
      <Button type="button" variant="outline" disabled={pending} onClick={() => run({ kind: 'saveDraft', id: form.id, definition }, { kind: 'publish', id: form.id })}>Publish</Button>
      {form.status === 'PUBLISHED' && <Button type="button" variant="outline" disabled={pending} onClick={() => run({ kind: 'pause', id: form.id })}>Pause</Button>}
      {form.status === 'PAUSED' && <Button type="button" variant="outline" disabled={pending} onClick={() => run({ kind: 'resume', id: form.id })}>Resume</Button>}
    </div>

    <section aria-label="Preview" className="rounded-md border bg-muted/30 p-3">
      <p className="mb-2 text-xs font-medium text-muted-foreground">Preview: what {internal ? 'members see' : 'the client sees'}</p>
      <RequestForm definition={definition} organizationName={organizationName} preview />
    </section>
  </div>;
}

/** Where this internal form's change requests go. Saving checks the choice against the connected Linear account. */
function DestinationPicker({ form, teams, pending, run }: { form: IntakeForm; teams: LinearTeamChoice[] | null; pending: boolean; run: (...inputs: unknown[]) => void }) {
  const [teamId, setTeamId] = useState(form.destination?.teamId ?? '');
  const [projectId, setProjectId] = useState(form.destination?.projectId ?? '');
  const current = form.destination && teams?.find(t => t.id === form.destination!.teamId);
  const currentProject = form.destination?.projectId && current?.projects.find(p => p.id === form.destination!.projectId);
  return <fieldset className="min-w-0 space-y-2 rounded-md border p-2">
    <legend className="px-1 text-xs text-muted-foreground">Delivery</legend>
    <p className="text-sm">{form.destination
      ? `Delivered to Linear team ${current?.name ?? form.destination.teamId}${form.destination.projectId ? `, project ${currentProject ? currentProject.name : form.destination.projectId}` : ''}.`
      : 'Not delivered to a tracker.'}</p>
    {!teams ? <p className="text-sm text-muted-foreground">Connect Linear under Integrations to deliver change requests from this form.</p> : <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-0 max-w-full"><label htmlFor={`team-${form.id}`} className="block text-sm">Linear team for {form.draft.title}</label>
        <select id={`team-${form.id}`} className={selectClass} value={teamId} onChange={e => { setTeamId(e.target.value); setProjectId(''); }}>
          <option value="">Don&apos;t deliver</option>
          {teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
        </select></div>
      {teamId && <div className="min-w-0 max-w-full"><label htmlFor={`project-${form.id}`} className="block text-sm">Linear project for {form.draft.title} (optional)</label>
        <select id={`project-${form.id}`} className={selectClass} value={projectId} onChange={e => setProjectId(e.target.value)}>
          <option value="">No project</option>
          {teams.find(t => t.id === teamId)?.projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select></div>}
      <Button type="button" variant="outline" size="sm" disabled={pending}
        onClick={() => run({ kind: 'setDestination', id: form.id, teamId: teamId || null, projectId: teamId && projectId ? projectId : null })}>Save destination</Button>
    </div>}
  </fieldset>;
}

function splitOptions(text: string): string[] {
  return text.split(',').map(option => option.trim()).filter(Boolean);
}

function uniqueKey(label: string, taken: string[]): string {
  const base = slugifyFieldKey(label) || 'field';
  let key = base;
  for (let n = 2; taken.includes(key); n++) key = `${base}_${n}`;
  return key;
}
