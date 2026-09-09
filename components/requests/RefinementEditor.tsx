"use client"
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { refinementSchema, type RefinementContent } from '@/config/refinement';
import type { RefinementView } from '@/lib/db/queries/refinement';
import { saveRequestRefinement, reassessRequest } from '@/app/(dashboard)/requests/[id]/edit/actions';

function TextField({ label, value, onChange, multiline = false, required = false }: { label: string; value: string; onChange: (value: string) => void; multiline?: boolean; required?: boolean }) {
  const id = label.replaceAll(' ', '-');
  return <div className="space-y-1"><label htmlFor={id} className="text-sm font-medium">{label}</label>{multiline
    ? <Textarea id={id} value={value} onChange={event => onChange(event.target.value)} rows={4} maxLength={20000} required={required} />
    : <Input id={id} value={value} onChange={event => onChange(event.target.value)} maxLength={2000} required={required} />}</div>;
}

function cleanLines(content: RefinementContent): RefinementContent {
  const clean = (lines: string[]) => lines.map(line => line.trim()).filter(Boolean);
  return { ...content, epic: content.epic ? { ...content.epic, goals: clean(content.epic.goals), successCriteria: clean(content.epic.successCriteria) } : null,
    stories: content.stories.map(story => ({ ...story, acceptanceCriteria: clean(story.acceptanceCriteria) })) };
}

export function RefinementEditor({ requestId, view }: { requestId: string; view: RefinementView }) {
  const router = useRouter();
  const [draft, setDraft] = useState(view.content);
  const [error, setError] = useState('');
  const [confirmReassessment, setConfirmReassessment] = useState(false);
  const [pending, startTransition] = useTransition();
  function updateStory(index: number, patch: Partial<RefinementContent['stories'][number]>) {
    setDraft({ ...draft, stories: draft.stories.map((story, i) => i === index ? { ...story, ...patch } : story) });
  }
  function move(index: number, direction: number) {
    const stories = [...draft.stories];
    [stories[index], stories[index + direction]] = [stories[index + direction], stories[index]];
    setDraft({ ...draft, stories });
  }
  return <div className="mx-auto max-w-4xl space-y-6">
    <Link href={`/requests/${requestId}`} className="text-sm underline">Back to request</Link>
    <h1 className="text-2xl font-bold">Refine request</h1>
    <p className="text-sm text-muted-foreground">Title or summary changes require a new assessment. Epic and story changes require renewed review. Human revisions are retained and protected from AI regeneration. Editing is available before export and before work starts.</p>
    {!view.canEdit && <p className="text-sm">{view.exported ? 'This request has been exported. Manage its content in the linked tracker.' : 'This lifecycle state does not allow editing.'}</p>}
    {error && <p role="alert" className="whitespace-pre-wrap text-sm text-destructive">{error}</p>}
    <form className="space-y-6" onSubmit={event => {
      event.preventDefault(); setError('');
      const parsed = refinementSchema.safeParse(cleanLines(draft));
      if (!parsed.success) { setError(parsed.error.issues.map(issue => `${issue.path.join(' ')}: ${issue.message}`).join('\n')); return; }
      startTransition(async () => {
        try {
          const result = await saveRequestRefinement(requestId, view.revision, parsed.data);
          if (!result.success) { setError(result.error ?? 'Unable to save revision.'); return; }
          router.push(`/requests/${requestId}`); router.refresh();
        } catch { setError('Unable to save revision. Try again.'); }
      });
    }}>
      <fieldset disabled={!view.canEdit || pending} className="space-y-6">
        <TextField label="Request title" value={draft.title} required onChange={title => setDraft({ ...draft, title })} />
        <TextField label="Request summary" value={draft.summary} multiline onChange={summary => setDraft({ ...draft, summary })} />
        {draft.epic && <section className="space-y-4 border-t pt-5"><h2 className="text-lg font-semibold">Epic</h2>
          {(['title', 'description', 'technicalNotes'] as const).map(key => <TextField key={key} label={`Epic ${key === 'technicalNotes' ? 'technical notes' : key}`} value={draft.epic![key]} required={key === 'title'} multiline={key !== 'title'} onChange={value => setDraft({ ...draft, epic: { ...draft.epic!, [key]: value } })} />)}
          {(['goals', 'successCriteria'] as const).map(key => <TextField key={key} label={`Epic ${key === 'goals' ? 'goals' : 'success criteria'} (one per line)`} value={draft.epic![key].join('\n')} multiline onChange={value => setDraft({ ...draft, epic: { ...draft.epic!, [key]: value.split('\n') } })} />)}
        </section>}
        {draft.epic && <section className="space-y-6 border-t pt-5"><h2 className="text-lg font-semibold">Stories</h2>
          {draft.stories.map((story, index) => <div key={story.id ?? `new-${index}`} className="space-y-3 border-b pb-5">
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium">Story {index + 1}</h3><div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" disabled={index === 0} onClick={() => move(index, -1)}>Move story {index + 1} up</Button>
              <Button type="button" variant="outline" size="sm" disabled={index === draft.stories.length - 1} onClick={() => move(index, 1)}>Move story {index + 1} down</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setDraft({ ...draft, stories: draft.stories.filter((_, i) => i !== index) })}>Remove story {index + 1}</Button>
            </div></div>
            {([{ key: 'title', label: 'title' }, { key: 'asA', label: 'As a' }, { key: 'iWant', label: 'I want' }, { key: 'soThat', label: 'So that' }] as const).map(({ key, label }) => <TextField key={key} label={`Story ${index + 1} ${label}`} value={story[key]} required onChange={value => updateStory(index, { [key]: value })} />)}
            <TextField label={`Story ${index + 1} acceptance criteria (one per line)`} value={story.acceptanceCriteria.join('\n')} multiline onChange={value => updateStory(index, { acceptanceCriteria: value.split('\n') })} />
            <TextField label={`Story ${index + 1} technical notes`} value={story.technicalNotes} multiline onChange={value => updateStory(index, { technicalNotes: value })} />
            <div><label htmlFor={`estimate-${index}`} className="text-sm">Story {index + 1} points</label><Input id={`estimate-${index}`} type="number" min={0} max={1000} value={story.storyPoints ?? ''} onChange={event => updateStory(index, { storyPoints: event.target.value === '' ? null : Number(event.target.value) })} /></div>
          </div>)}
          <Button type="button" variant="outline" disabled={draft.stories.length >= 100} onClick={() => setDraft({ ...draft, stories: [...draft.stories, { title: '', asA: '', iWant: '', soThat: '', acceptanceCriteria: [], technicalNotes: '', storyPoints: null }] })}>Add story</Button>
        </section>}
      </fieldset>
      {view.canEdit && <div className="flex flex-wrap gap-3"><Button disabled={pending} type="submit">{pending ? 'Saving…' : 'Save revision'}</Button><Button variant="outline" type="button" disabled={pending} onClick={() => { setDraft(view.content); setError(''); }}>Cancel edits</Button></div>}
    </form>
    {view.canReassess && <Button variant="outline" disabled={pending} onClick={() => setConfirmReassessment(true)}>Request reassessment</Button>}
    <Dialog open={confirmReassessment} onOpenChange={setConfirmReassessment}><DialogContent><DialogTitle>Reassess with the current scoring policy?</DialogTitle><DialogDescription>The current assessment and security review will move to history. The request returns to assessment, then requires renewed review. Saved human epic and story text is retained. Unsaved edits are not included.</DialogDescription>
      <Button disabled={pending} onClick={() => startTransition(async () => {
        try {
          const result = await reassessRequest(requestId, view.revision);
          if (!result.success) { setError(result.error ?? 'Unable to request reassessment.'); setConfirmReassessment(false); return; }
          router.push(`/requests/${requestId}/workflow`); router.refresh();
        } catch { setError('Unable to request reassessment.'); setConfirmReassessment(false); }
      })}>Confirm reassessment</Button>
    </DialogContent></Dialog>
    <section className="space-y-3 border-t pt-5"><h2 className="text-lg font-semibold">Revision history</h2>
      {!view.history.length && <p className="text-sm text-muted-foreground">No human revisions yet.</p>}
      {view.history.map(revision => <details key={revision.id} className="rounded-md border p-3"><summary className="cursor-pointer text-sm">{revision.reason} · {new Date(revision.createdAt).toLocaleString()}</summary>
        <div className="mt-3 grid gap-4 lg:grid-cols-2"><div><h3>Before</h3><pre className="whitespace-pre-wrap break-words text-xs">{JSON.stringify(revision.before, null, 2)}</pre></div><div><h3>After</h3><pre className="whitespace-pre-wrap break-words text-xs">{JSON.stringify(revision.after, null, 2)}</pre></div></div>
      </details>)}
    </section>
  </div>;
}
