"use server";

import { auth } from '@/auth';
import { revalidatePath } from 'next/cache';
import { setWorkspaceSetupDismissed } from '@/lib/db/queries/setup';

export async function setSetupChecklistDismissed(
  dismissed: boolean,
): Promise<{ success: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id || !session.user.orgId) {
    return { success: false, error: 'Your session expired. Sign in again.' };
  }
  try {
    const updated = await setWorkspaceSetupDismissed(
      session.user.orgId,
      session.user.id,
      dismissed,
    );
    if (!updated) {
      return {
        success: false,
        error: 'Your workspace membership changed. Reload and try again.',
      };
    }
    revalidatePath('/requests');
    return { success: true };
  } catch {
    return { success: false, error: 'Unable to update the setup checklist. Try again.' };
  }
}
