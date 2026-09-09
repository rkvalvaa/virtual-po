"use server"

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requireAuth } from '@/lib/auth/session'
import { canAccess } from '@/lib/auth/rbac'
import { reconcilePlanningCapacity, updateRequestPlanning } from '@/lib/db/queries/planning'

const nullableUuid = z.preprocess(value => value == null || value === '' ? null : value, z.uuid().nullable())
const nullableQuarter = z.preprocess(value => value == null || value === '' ? null : value, z.string().regex(/^[0-9]{4}-Q[1-4]$/).nullable())
const nullableNumber = z.preprocess(value => value == null || value === '' ? null : Number(value), z.number().nullable())

const requestPlanningSchema = z.object({
  requestId: z.uuid(),
  expectedUpdatedAt: z.iso.datetime(),
  expectedPlanningVersion: z.coerce.number().int().min(0),
  assigneeId: nullableUuid,
  commitment: z.preprocess(value => value == null || value === '' ? null : value, z.enum(['NOW', 'NEXT', 'LATER']).nullable()),
  targetPeriod: nullableQuarter,
  manualRank: nullableNumber.pipe(z.number().int().min(1).max(100000).nullable()),
  objectiveId: nullableUuid,
  plannedEffortDays: nullableNumber.pipe(z.number().min(0).max(100000).nullable()),
})

export async function updatePlanningRequestAction(
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  const session = await requireAuth()
  if (!session.user.orgId || !canAccess(session.user.role, 'REVIEWER')) {
    return { success: false, error: 'Current reviewer permission is required to edit planning.' }
  }
  const parsed = requestPlanningSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { success: false, error: 'Check the planning values and try again.' }
  try {
    await updateRequestPlanning({
      organizationId: session.user.orgId,
      actorId: session.user.id,
      requestId: parsed.data.requestId,
      expectedUpdatedAt: new Date(parsed.data.expectedUpdatedAt),
      expectedPlanningVersion: parsed.data.expectedPlanningVersion,
      assigneeId: parsed.data.assigneeId,
      commitment: parsed.data.commitment,
      targetPeriod: parsed.data.targetPeriod,
      manualRank: parsed.data.manualRank,
      objectiveId: parsed.data.objectiveId,
      plannedEffortDays: parsed.data.plannedEffortDays,
    })
    revalidatePath('/planning')
    revalidatePath(`/requests/${parsed.data.requestId}`)
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unable to update planning.' }
  }
}

const reconcileSchema = z.object({
  quarter: z.string().regex(/^[0-9]{4}-Q[1-4]$/),
  reconciliation: z.enum(['REPLACED_BY_REQUESTS', 'RETAINED_AS_OUTSIDE_WORK']),
})

export async function reconcileCapacityAction(
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  const session = await requireAuth()
  if (!session.user.orgId || session.user.role !== 'ADMIN') {
    return { success: false, error: 'Only administrators can reconcile capacity allocation.' }
  }
  const parsed = reconcileSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { success: false, error: 'Choose a valid reconciliation option.' }
  try {
    await reconcilePlanningCapacity(
      session.user.orgId,
      parsed.data.quarter,
      parsed.data.reconciliation,
      session.user.id,
    )
    revalidatePath('/planning')
    revalidatePath('/settings')
    return { success: true }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Unable to reconcile capacity.' }
  }
}
