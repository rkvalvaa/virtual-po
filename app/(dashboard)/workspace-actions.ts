"use server";

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { auth, updateSession } from '@/auth';
import { getOrganizationRole } from '@/lib/db/queries/organizations';

export async function switchWorkspace(orgId: string): Promise<{ success: boolean; error?: string }> {
  if (!z.uuid().safeParse(orgId).success) return { success: false, error: 'Choose a valid workspace.' };
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: 'Your session expired. Sign in again.' };
  try {
    if (!await getOrganizationRole(orgId, session.user.id)) {
      return { success: false, error: 'This workspace membership is no longer available. Reload to refresh your workspaces.' };
    }
    // The JWT callback rechecks membership, derives the role, and remembers
    // only a validated destination. Check its result to catch revocation races.
    const updated = await updateSession({ user: { orgId } });
    if (updated?.user?.orgId !== orgId) {
      return { success: false, error: 'Unable to switch. Your membership may have changed; reload and try again.' };
    }
    revalidatePath('/', 'layout');
    return { success: true };
  } catch {
    return { success: false, error: 'Unable to switch workspace. Reload and try again.' };
  }
}
