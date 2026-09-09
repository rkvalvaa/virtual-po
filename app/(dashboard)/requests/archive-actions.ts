'use server';
import { requireAuth } from '@/lib/auth/session';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { bulkSetRequestArchived } from '@/lib/db/queries/archive';

export async function archiveRequests(requestIds: string[], archived: boolean) {
  const session = await requireAuth();
  if (!session.user.orgId) throw new Error('Workspace membership is required.');
  z.boolean().parse(archived);
  const results = await bulkSetRequestArchived(requestIds, session.user.orgId, session.user.id, archived);
  revalidatePath('/requests', 'layout');
  revalidatePath('/review');
  revalidatePath('/backlog');
  revalidatePath('/dashboard');
  revalidatePath('/planning');
  return results;
}
