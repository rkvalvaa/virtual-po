"use server"

import { revalidatePath } from 'next/cache';
import { auth, updateSession } from '@/auth';
import { acceptInvitation } from '@/lib/db/queries/invitations';

export async function joinInvitedOrganization(token: string): Promise<{ success: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { success: false, error: 'Sign in before accepting this invitation.' };
  try {
    const destination = await acceptInvitation(token, session.user.id);
    await updateSession({ user: { orgId: destination.orgId } });
    revalidatePath('/', 'layout');
    return { success: true };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : 'Unable to accept invitation.' }; }
}
