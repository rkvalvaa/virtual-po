"use server";
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth/session';
import { selectDocumentContext } from '@/lib/documents/context';

export async function setDocumentContext(attachmentId: string, selected: boolean): Promise<{ success: boolean; error?: string }> {
  const session = await requireAuth();
  if (!session.user.orgId || !z.uuid().safeParse(attachmentId).success || typeof selected !== 'boolean') {
    return { success: false, error: 'Invalid document selection.' };
  }
  try {
    await selectDocumentContext(attachmentId, session.user.orgId, session.user.id, selected);
    revalidatePath('/requests', 'layout');
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unable to update supporting documents.' };
  }
}
