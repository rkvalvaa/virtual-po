import type { RequestStatus } from '@/lib/types/database'

export const PLANNING_COMMITMENTS = ['NOW', 'NEXT', 'LATER'] as const
export type PlanningCommitment = typeof PLANNING_COMMITMENTS[number]

export const CAPACITY_RECONCILIATIONS = [
  'REPLACED_BY_REQUESTS',
  'RETAINED_AS_OUTSIDE_WORK',
] as const
export type CapacityReconciliation = typeof CAPACITY_RECONCILIATIONS[number]

export interface PlanningRequest {
  id: string
  title: string
  status: RequestStatus
  assigneeId: string | null
  assigneeName: string | null
  commitment: PlanningCommitment | null
  targetPeriod: string | null
  manualRank: number | null
  objectiveId: string | null
  objectiveTitle: string | null
  plannedEffortDays: number | null
  priorityScore: number | null
  storyPointsTotal: number
  unknownStoryPointsCount: number
  planningVersion: number
  updatedAt: Date
}

export interface PlanningCapacity {
  quarter: string
  configured: boolean
  notes: string | null
  totalCapacityDays: number
  legacyAllocatedDays: number
  requestDerivedDays: number
  unknownRequestEstimates: number
  reconciliation: CapacityReconciliation | null
  reconciledAt: Date | null
  effectiveAllocatedDays: number | null
  remainingDays: number | null
  overAllocatedDays: number | null
}
