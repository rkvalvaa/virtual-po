"use server"
import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth/session';
import { saveRefinement, requestReassessment } from '@/lib/db/queries/refinement';

export async function saveRequestRefinement(requestId: string, revision: string, input: unknown): Promise<{ success: boolean; error?: string }> {
  const session = await requireAuth();
  if (!session.user.orgId) return { success: false, error: 'No active organization.' };
  try {
    await saveRefinement(requestId, session.user.orgId, session.user.id, revision, input);
    revalidatePath(`/requests/${requestId}`, 'layout'); revalidatePath('/review'); revalidatePath('/backlog');
    return { success: true };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : 'Unable to save revision.' }; }
}

export async function reassessRequest(requestId: string, revision: string): Promise<{ success: boolean; error?: string }> {
  const session = await requireAuth();
  if (!session.user.orgId) return { success: false, error: 'No active organization.' };
  try {
    await requestReassessment(requestId, session.user.orgId, session.user.id, revision);
    revalidatePath(`/requests/${requestId}`, 'layout'); revalidatePath('/review'); revalidatePath('/backlog');
    return { success: true };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : 'Unable to request reassessment.' }; }
}
