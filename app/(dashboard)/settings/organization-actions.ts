"use server"

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth/session';
import { lockOrganizationAdmin } from '@/lib/auth/organization-admin';
import { transaction } from '@/lib/db/pool';
import { getOrganizationById, updateOrganization } from '@/lib/db/queries/organizations';
import { logActivity } from '@/lib/db/queries/activity-log';
import { changeOrganizationMember } from '@/lib/db/queries/organization-members';

const memberChangeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('role'), role: z.enum(['ADMIN', 'REVIEWER', 'STAKEHOLDER']) }),
  z.object({ kind: z.literal('remove') }),
  z.object({ kind: z.literal('handover') }),
]);

export async function updateMember(targetId: string, input: unknown): Promise<{ success: boolean; error?: string }> {
  const session = await requireAuth();
  const orgId = session.user.orgId;
  if (!orgId || session.user.role !== 'ADMIN') return { success: false, error: 'Only administrators can manage members.' };
  const parsed = memberChangeSchema.safeParse(input);
  if (!z.uuid().safeParse(targetId).success || !parsed.success) return { success: false, error: 'Invalid membership change.' };
  try {
    await changeOrganizationMember(orgId, session.user.id, targetId, parsed.data);
    revalidatePath('/', 'layout');
    return { success: true };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : 'Unable to update member.' }; }
}

export async function renameOrganization(name: string): Promise<{ success: boolean; name?: string; error?: string }> {
  const session = await requireAuth();
  const orgId = session.user.orgId;
  if (!orgId || session.user.role !== 'ADMIN') return { success: false, error: 'Only administrators can edit the organization.' };
  const parsed = z.string().trim().min(1).max(120).safeParse(name);
  if (!parsed.success) return { success: false, error: 'Enter an organization name between 1 and 120 characters.' };
  try {
    await transaction(async () => {
      await lockOrganizationAdmin(orgId, session.user.id);
      const previous = await getOrganizationById(orgId);
      if (!previous) throw new Error('Organization not found.');
      await updateOrganization(orgId, { name: parsed.data });
      await logActivity({ organizationId: orgId, userId: session.user.id, action: 'ORGANIZATION_UPDATED', entityType: 'ORGANIZATION', entityId: orgId, metadata: { previousName: previous.name, name: parsed.data } });
    });
    revalidatePath('/settings');
    revalidatePath('/', 'layout');
    return { success: true, name: parsed.data };
  } catch {
    return { success: false, error: 'Unable to save. Verify that you still have administrator access and try again.' };
  }
}
