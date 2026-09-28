"use server"

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/lib/auth/session';
import {
  archiveServiceGroup, createServiceGroup, removeGroupMember, renameServiceGroup, setFallbackOwner, setGroupMember,
} from '@/lib/db/queries/service-groups';

const name = z.string().trim().min(1).max(120);
const inputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('create'), name, fallbackOwnerId: z.uuid() }),
  z.object({ kind: z.literal('rename'), groupId: z.uuid(), name }),
  z.object({ kind: z.literal('archive'), groupId: z.uuid() }),
  z.object({ kind: z.literal('setFallbackOwner'), groupId: z.uuid(), userId: z.uuid() }),
  z.object({ kind: z.literal('setMember'), groupId: z.uuid(), userId: z.uuid(), role: z.enum(['MEMBER', 'LEAD']) }),
  z.object({ kind: z.literal('removeMember'), groupId: z.uuid(), userId: z.uuid() }),
]);

/** ADMIN-only; the query layer re-checks current admin access inside each change. */
export async function manageServiceGroups(input: unknown): Promise<{ success: boolean; error?: string }> {
  const session = await requireAuth();
  const orgId = session.user.orgId;
  if (!orgId || session.user.role !== 'ADMIN') return { success: false, error: 'Only administrators can manage service groups.' };
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Enter a group name and choose members from this workspace.' };
  const action = parsed.data;
  const actorId = session.user.id;
  try {
    switch (action.kind) {
      case 'create': await createServiceGroup(orgId, actorId, { name: action.name, fallbackOwnerId: action.fallbackOwnerId }); break;
      case 'rename': await renameServiceGroup(orgId, actorId, action.groupId, action.name); break;
      case 'archive': await archiveServiceGroup(orgId, actorId, action.groupId); break;
      case 'setFallbackOwner': await setFallbackOwner(orgId, actorId, action.groupId, action.userId); break;
      case 'setMember': await setGroupMember(orgId, actorId, action.groupId, { userId: action.userId, role: action.role }); break;
      case 'removeMember': await removeGroupMember(orgId, actorId, action.groupId, action.userId); break;
    }
    return { success: true };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : 'Unable to update service groups.' }; }
  finally { revalidatePath('/settings'); }
}
