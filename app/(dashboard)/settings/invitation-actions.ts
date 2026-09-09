"use server"

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth/session';
import { createInvitation, resendInvitation, revokeInvitation, recordInvitationDelivery } from '@/lib/db/queries/invitations';
import { sendInvitationEmail } from '@/lib/email/invitation';

const inputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('create'), email: z.email(), role: z.enum(['ADMIN', 'REVIEWER', 'STAKEHOLDER']) }),
  z.object({ kind: z.literal('resend'), id: z.uuid() }),
  z.object({ kind: z.literal('revoke'), id: z.uuid() }),
]);

export async function manageInvitation(input: unknown): Promise<{ success: boolean; error?: string }> {
  const session = await requireAuth();
  const orgId = session.user.orgId;
  if (!orgId || session.user.role !== 'ADMIN') return { success: false, error: 'Only administrators can manage invitations.' };
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Enter a valid email, role, and invitation.' };
  const action = parsed.data;
  try {
    if (action.kind === 'revoke') {
      await revokeInvitation(orgId, session.user.id, action.id);
      return { success: true };
    }
    const invite = action.kind === 'create'
      ? await createInvitation(orgId, session.user.id, action.email, action.role)
      : await resendInvitation(orgId, session.user.id, action.id);
    const result = await sendInvitationEmail(invite);
    await recordInvitationDelivery(orgId, invite, result.error);
    return result;
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : 'Unable to manage invitation.' }; }
  finally { revalidatePath('/settings'); }
}
