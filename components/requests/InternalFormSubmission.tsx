"use client"

import { useActionState, useState } from 'react';
import { RequestForm } from '@/components/portal/RequestForm';
import type { FormDefinition } from '@/lib/forms/definition';
import type { InternalSubmitState } from '@/app/(dashboard)/requests/new/forms/[id]/actions';

/** A published internal form. A successful submission opens the new change request. */
export function InternalFormSubmission({ definition, organizationName, submit }: {
  definition: FormDefinition;
  organizationName: string;
  submit: (previous: InternalSubmitState, formData: FormData) => Promise<InternalSubmitState>;
}) {
  const [state, action, pending] = useActionState(submit, null);
  // One key per form visit: resubmitting after a lost response opens the same request.
  const [submissionKey] = useState(() => crypto.randomUUID());
  return <RequestForm definition={definition} organizationName={organizationName} action={action} pending={pending}
    errors={state?.status === 'invalid' ? state.errors : undefined}>
    <input type="hidden" name="__submissionKey" value={submissionKey} />
    {state?.status === 'error' && <p role="alert" className="text-sm text-destructive">{state.message}</p>}
  </RequestForm>;
}
