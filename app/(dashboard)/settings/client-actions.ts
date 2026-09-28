"use server"

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth/session';
import {
  addClientContact,
  archiveClientAccount,
  createClientAccount,
  getClientWelcome,
  recordClientWelcome,
  renameClientAccount,
  revokeClientContact,
} from '@/lib/db/queries/client-accounts';
import { sendClientWelcomeEmail } from '@/lib/email/client-invitation';

const name = z.string().trim().min(1).max(120);
const inputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('createAccount'), name }),
  z.object({ kind: z.literal('renameAccount'), id: z.uuid(), name }),
  z.object({ kind: z.literal('archiveAccount'), id: z.uuid() }),
  z.object({ kind: z.literal('addContact'), accountId: z.uuid(), email: z.email(), name: z.string().max(120).optional() }),
  z.object({ kind: z.literal('revokeContact'), id: z.uuid() }),
  z.object({ kind: z.literal('resendWelcome'), id: z.uuid() }),
]);

export async function manageClients(input: unknown): Promise<{ success: boolean; error?: string }> {
  const session = await requireAuth();
  const orgId = session.user.orgId;
  if (!orgId || session.user.role !== 'ADMIN') return { success: false, error: 'Only administrators can manage clients.' };
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Enter a valid client name, contact email and selection.' };
  const action = parsed.data;
  const actorId = session.user.id;
  try {
    switch (action.kind) {
      case 'createAccount': await createClientAccount(orgId, actorId, action.name); break;
      case 'renameAccount': await renameClientAccount(orgId, actorId, action.id, action.name); break;
      case 'archiveAccount': await archiveClientAccount(orgId, actorId, action.id); break;
      case 'addContact': {
        const { id } = await addClientContact(orgId, actorId, action.accountId, action.email, action.name);
        const sent = await welcome(orgId, id);
        return sent.success ? sent : { success: false, error: `Contact added, but the welcome email was not sent: ${sent.error}` };
      }
      case 'revokeContact': await revokeClientContact(orgId, actorId, action.id); break;
      case 'resendWelcome': return await welcome(orgId, action.id);
    }
    return { success: true };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : 'Unable to update clients.' }; }
  finally { revalidatePath('/settings'); }
}

async function welcome(orgId: string, contactId: string): Promise<{ success: boolean; error?: string }> {
  const details = await getClientWelcome(orgId, contactId);
  if (!details) return { success: false, error: 'Contact not found.' };
  const result = await sendClientWelcomeEmail(details);
  await recordClientWelcome(orgId, contactId, result.error);
  return result;
}
