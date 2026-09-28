"use client"

import { useActionState, useState } from 'react';
import Link from 'next/link';
import { RequestForm } from './RequestForm';
import type { FormDefinition } from '@/lib/forms/definition';
import type { SubmitState } from '@/app/portal/forms/[id]/actions';

export function PortalFormSubmission({ definition, organizationName, submit }: {
  definition: FormDefinition;
  organizationName: string;
  submit: (previous: SubmitState, formData: FormData) => Promise<SubmitState>;
}) {
  const [state, action, pending] = useActionState(submit, null);
  // One key per form visit: resubmitting after a lost response returns the same receipt.
  const [submissionKey] = useState(() => crypto.randomUUID());

  if (state?.status === 'received') {
    return <div className="space-y-2">
      <h2 className="text-lg font-semibold">Received</h2>
      <p className="text-sm">We have your request. Keep this reference for any follow-up:</p>
      <p className="font-mono text-lg tracking-widest">{state.reference}</p>
      <p className="text-sm text-muted-foreground">The team will review it and contact you if they need more information.</p>
      <Link href={`/portal/requests/${state.reference}`} className="text-sm underline">Follow this request</Link>
    </div>;
  }
  return <RequestForm definition={definition} organizationName={organizationName} action={action} pending={pending}
    errors={state?.status === 'invalid' ? state.errors : undefined}>
    <input type="hidden" name="__submissionKey" value={submissionKey} />
    {state?.status === 'error' && <p role="alert" className="text-sm text-destructive">{state.message}</p>}
  </RequestForm>;
}
