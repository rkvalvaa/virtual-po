"use server"

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth/session';
import { formDefinitionSchema } from '@/lib/forms/definition';
import { createForm, createInternalForm, publishForm, saveFormDraft, setFormPaused } from '@/lib/db/queries/intake-forms';

const inputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('create'), clientAccountId: z.uuid(), title: z.string().trim().min(1).max(120) }),
  z.object({ kind: z.literal('createInternal'), serviceGroupId: z.uuid(), title: z.string().trim().min(1).max(120) }),
  z.object({ kind: z.literal('saveDraft'), id: z.uuid(), definition: formDefinitionSchema }),
  z.object({ kind: z.literal('publish'), id: z.uuid() }),
  z.object({ kind: z.literal('pause'), id: z.uuid() }),
  z.object({ kind: z.literal('resume'), id: z.uuid() }),
]);

export async function manageForms(input: unknown): Promise<{ success: boolean; error?: string }> {
  const session = await requireAuth();
  const orgId = session.user.orgId;
  if (session.user.role !== 'ADMIN') return { success: false, error: 'Only administrators can manage forms.' };
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Check the form title, client or group, and every field (label, type and options).' };
  const action = parsed.data;
  const actorId = session.user.id;
  try {
    switch (action.kind) {
      case 'create': await createForm(orgId, actorId, action.clientAccountId, action.title); break;
      case 'createInternal': await createInternalForm(orgId, actorId, action.serviceGroupId, action.title); break;
      case 'saveDraft': await saveFormDraft(orgId, actorId, action.id, action.definition); break;
      case 'publish': await publishForm(orgId, actorId, action.id); break;
      case 'pause': await setFormPaused(orgId, actorId, action.id, true); break;
      case 'resume': await setFormPaused(orgId, actorId, action.id, false); break;
    }
    return { success: true };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : 'Unable to update the form.' }; }
  finally { revalidatePath('/settings'); }
}
