"use server"
import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth/session';
import { saveScoringPolicy } from '@/lib/db/queries/scoring-policy';
import type { ScoringPolicy } from '@/config/scoring-policy';

export async function updateScoringConfiguration(input: unknown, expectedVersion: number): Promise<{ success: boolean; policy?: ScoringPolicy; error?: string }> {
  const session = await requireAuth();
  if (!session.user.orgId || session.user.role !== 'ADMIN') return { success: false, error: 'Only administrators can edit scoring.' };
  try {
    const policy = await saveScoringPolicy(session.user.orgId, session.user.id, input, expectedVersion);
    revalidatePath('/settings');
    return { success: true, policy };
  } catch { return { success: false, error: 'Unable to save. Check weight totals and ordered thresholds, or reload if another administrator changed the policy.' }; }
}
