"use client"
import { useState, useTransition } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { scoringConfigSchema, type ScoringPolicy } from '@/config/scoring-policy';
import type { ScoringConfig } from '@/config/scoring';
import { updateScoringConfiguration } from '@/app/(dashboard)/settings/scoring-actions';

export function ScoringSettings({ policy, userRole }: { policy: ScoringPolicy; userRole: string }) {
  const [saved, setSaved] = useState(policy);
  const [draft, setDraft] = useState(policy.config);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const disabled = userRole !== 'ADMIN' || pending;
  return <Card>
    <CardHeader><CardTitle>Scoring Configuration</CardTitle><CardDescription>Policy version {saved.version}{saved.version === 0 ? ' (reconciled legacy configuration)' : ''}</CardDescription></CardHeader>
    <CardContent className="space-y-4">
      <form className="space-y-4" onSubmit={event => {
        event.preventDefault(); setError(''); setMessage('');
        const parsed = scoringConfigSchema.safeParse(draft);
        if (!parsed.success) { setError(parsed.error.issues.map(issue => issue.message).join(' ')); return; }
        startTransition(async () => {
          try {
            const result = await updateScoringConfiguration(parsed.data, saved.version);
            if (!result.success || !result.policy) { setError(result.error ?? 'Unable to save scoring.'); return; }
            setSaved(result.policy); setDraft(result.policy.config); setMessage(`Saved scoring policy version ${result.policy.version}.`);
          } catch { setError('Unable to save scoring. Try again.'); }
        });
      }}>
        <div className="min-w-0"><label htmlFor="scoring-framework" className="mb-1 block text-sm">Framework</label><select id="scoring-framework" value={draft.framework} disabled={disabled} className="w-full min-w-0 max-w-full rounded-md border bg-background p-2 text-sm"
          onChange={event => setDraft({ ...draft, framework: event.target.value as ScoringConfig['framework'] })}>
          <option value="RICE">RICE</option><option value="WSJF">WSJF</option><option value="CUSTOM">Custom weighted dimensions</option>
        </select></div>
        <p className="text-sm text-muted-foreground">{draft.framework === 'RICE' ? 'RICE = reach × impact × confidence / 100 ÷ effort × 10. Effort is in person-months. Rounded and capped at 100.' : draft.framework === 'WSJF' ? 'WSJF = (business value + time criticality + risk reduction) ÷ job size × 10. Rounded and capped at 100.' : 'Custom = weighted business + technical + (100 − risk) scores.'}</p>
        <fieldset disabled={disabled || draft.framework !== 'CUSTOM'} className="grid gap-3 sm:grid-cols-3">
          <legend className="mb-2 text-sm">Custom weights (total 100%; used only by Custom)</legend>
          {(['business', 'technical', 'risk'] as const).map(key => <div key={key}><label htmlFor={`weight-${key}`} className="text-sm capitalize">{key} %</label><Input id={`weight-${key}`} type="number" min={0} max={100} step="0.1" value={Math.round(draft.weights[key] * 1000) / 10}
            onChange={event => setDraft({ ...draft, weights: { ...draft.weights, [key]: Number(event.target.value) / 100 } })} required /></div>)}
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          {(['highPriority', 'mediumPriority'] as const).map(key => <div key={key}><label htmlFor={`threshold-${key}`} className="text-sm">{key === 'highPriority' ? 'High priority threshold' : 'Medium priority threshold'}</label>
            <Input id={`threshold-${key}`} type="number" min={0} max={100} value={draft.thresholds[key]} required disabled={disabled} onChange={event => setDraft({ ...draft, thresholds: { ...draft.thresholds, [key]: Number(event.target.value) } })} /></div>)}
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}{message && <p role="status" className="text-sm">{message}</p>}
        {userRole === 'ADMIN' && <div className="flex flex-wrap gap-2"><Button disabled={pending} type="submit">Save scoring policy</Button><Button type="button" variant="outline" disabled={pending} onClick={() => { setDraft(saved.config); setError(''); }}>Cancel</Button></div>}
      </form>
      <p className="text-sm text-muted-foreground">Historical assessments retain their scores and policy labels. Saving a policy affects new assessments only. To apply it to an existing request, explicitly request reassessment from its detail page; renewed review is required.</p>
    </CardContent>
  </Card>;
}
