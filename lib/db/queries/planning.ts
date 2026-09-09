import { query, transaction } from '@/lib/db/pool'
import { canAccess } from '@/lib/auth/rbac'
import type { UserRole } from '@/lib/types/database'
import type {
  CapacityReconciliation,
  PlanningCapacity,
  PlanningCommitment,
  PlanningRequest,
} from '@/lib/planning/types'

const QUARTER = /^[0-9]{4}-Q[1-4]$/

function numberOrNull(value: unknown): number | null {
  return value == null ? null : Number(value)
}

async function requireCurrentRole(
  organizationId: string,
  actorId: string,
  required: UserRole,
): Promise<void> {
  const membership = await query<{ role: UserRole }>(
    `SELECT role FROM organization_users
     WHERE organization_id=$1 AND user_id=$2
     FOR SHARE`,
    [organizationId, actorId],
  )
  if (!membership.rows[0] || !canAccess(membership.rows[0].role, required)) {
    throw new Error(`Current ${required.toLowerCase()} permission is required.`)
  }
}

export async function getPlanningBoard(organizationId: string): Promise<PlanningRequest[]> {
  const result = await query(
    `SELECT fr.id,fr.title,fr.status,fr.assignee_id,u.name AS assignee_name,
            fr.planning_commitment AS commitment,fr.target_period,fr.manual_rank,
            fr.planning_objective_id AS objective_id,o.title AS objective_title,
            fr.planned_effort_days,fr.priority_score,fr.planning_version,fr.updated_at,
            COALESCE(SUM(us.story_points) FILTER (WHERE us.story_points IS NOT NULL),0)::int AS story_points_total,
            COUNT(*) FILTER (WHERE us.id IS NOT NULL AND us.story_points IS NULL)::int AS unknown_story_points_count
     FROM feature_requests fr
     LEFT JOIN users u ON u.id=fr.assignee_id
     LEFT JOIN objectives o ON o.id=fr.planning_objective_id
     LEFT JOIN epics e ON e.request_id=fr.id
     LEFT JOIN user_stories us ON us.epic_id=e.id
     WHERE fr.organization_id=$1 AND fr.archived_at IS NULL
     GROUP BY fr.id,u.name,o.title
     ORDER BY CASE fr.planning_commitment WHEN 'NOW' THEN 0 WHEN 'NEXT' THEN 1 WHEN 'LATER' THEN 2 ELSE 3 END,
              fr.target_period ASC NULLS LAST,fr.manual_rank ASC NULLS LAST,
              fr.priority_score DESC NULLS LAST,fr.created_at ASC`,
    [organizationId],
  )
  return result.rows.map(row => ({
    id: row.id,
    title: row.title,
    status: row.status,
    assigneeId: row.assignee_id,
    assigneeName: row.assignee_name,
    commitment: row.commitment,
    targetPeriod: row.target_period,
    manualRank: row.manual_rank,
    objectiveId: row.objective_id,
    objectiveTitle: row.objective_title,
    plannedEffortDays: numberOrNull(row.planned_effort_days),
    priorityScore: numberOrNull(row.priority_score),
    storyPointsTotal: Number(row.story_points_total),
    unknownStoryPointsCount: Number(row.unknown_story_points_count),
    planningVersion: row.planning_version,
    updatedAt: row.updated_at,
  }))
}

export interface RequestPlanningUpdate {
  organizationId: string
  requestId: string
  actorId: string
  expectedUpdatedAt: Date
  expectedPlanningVersion: number
  assigneeId?: string | null
  commitment?: PlanningCommitment | null
  targetPeriod?: string | null
  manualRank?: number | null
  objectiveId?: string | null
  plannedEffortDays?: number | null
}

export async function updateRequestPlanning(input: RequestPlanningUpdate): Promise<void> {
  await transaction(async () => {
    await requireCurrentRole(input.organizationId, input.actorId, 'REVIEWER')
    const currentResult = await query(
      `SELECT assignee_id,planning_commitment,target_period,manual_rank,
              planning_objective_id,planned_effort_days,planning_version,updated_at,archived_at
       FROM feature_requests
       WHERE id=$1 AND organization_id=$2
       FOR UPDATE`,
      [input.requestId, input.organizationId],
    )
    const current = currentResult.rows[0]
    if (!current) throw new Error('Request is unavailable in this workspace.')
    if (current.archived_at) throw new Error('Archived requests must be restored before planning.')
    if (current.planning_version !== input.expectedPlanningVersion
      || current.updated_at.valueOf() !== input.expectedUpdatedAt.valueOf()) {
      throw new Error('This request changed after the planning view loaded. Refresh and try again.')
    }

    if (input.assigneeId) {
      const assignee = await query(
        `SELECT 1 FROM organization_users WHERE organization_id=$1 AND user_id=$2 FOR SHARE`,
        [input.organizationId, input.assigneeId],
      )
      if (!assignee.rows[0]) throw new Error('Assignee must be a current member of this workspace.')
    }
    if (input.objectiveId && input.objectiveId !== current.planning_objective_id) {
      const objective = await query(
        `SELECT 1 FROM objectives WHERE id=$1 AND organization_id=$2 AND status='ACTIVE' FOR UPDATE`,
        [input.objectiveId, input.organizationId],
      )
      if (!objective.rows[0]) throw new Error('Planning can only link an active objective in this workspace.')
    }
    if (input.targetPeriod != null && !QUARTER.test(input.targetPeriod)) {
      throw new Error('Target period must use the YYYY-Q1 format.')
    }
    if (input.manualRank != null && (!Number.isInteger(input.manualRank) || input.manualRank < 1 || input.manualRank > 100000)) {
      throw new Error('Manual rank must be a whole number from 1 to 100000.')
    }
    if (input.plannedEffortDays != null && (!Number.isFinite(input.plannedEffortDays) || input.plannedEffortDays < 0 || input.plannedEffortDays > 100000)) {
      throw new Error('Planned effort must be between 0 and 100000 days.')
    }

    const fields = [
      ['assigneeId', 'assignee_id', input.assigneeId, current.assignee_id],
      ['commitment', 'planning_commitment', input.commitment, current.planning_commitment],
      ['targetPeriod', 'target_period', input.targetPeriod, current.target_period],
      ['manualRank', 'manual_rank', input.manualRank, current.manual_rank],
      ['objectiveId', 'planning_objective_id', input.objectiveId, current.planning_objective_id],
      ['plannedEffortDays', 'planned_effort_days', input.plannedEffortDays, numberOrNull(current.planned_effort_days)],
    ] as const
    const assignments: string[] = []
    const values: unknown[] = []
    const changes: Record<string, { from: unknown; to: unknown }> = {}
    for (const [key, column, proposed, prior] of fields) {
      if (!(key in input)) continue
      if (proposed === prior) continue
      values.push(proposed)
      assignments.push(`${column}=$${values.length}`)
      changes[key] = { from: prior, to: proposed }
    }
    if (!assignments.length) return
    values.push(input.requestId, input.organizationId)
    await query(
      `UPDATE feature_requests SET ${assignments.join(',')},planning_version=planning_version+1,updated_at=clock_timestamp()
       WHERE id=$${values.length - 1} AND organization_id=$${values.length}`,
      values,
    )
    await query(
      `INSERT INTO request_planning_events(organization_id,request_id,actor_id,event_kind,changes)
       VALUES($1,$2,$3,'REQUEST_UPDATED',$4)`,
      [input.organizationId, input.requestId, input.actorId, JSON.stringify(changes)],
    )
  })
}

export async function getPlanningCapacity(
  organizationId: string,
  quarter: string,
): Promise<PlanningCapacity> {
  if (!QUARTER.test(quarter)) throw new Error('Quarter must use the YYYY-Q1 format.')
  const result = await query(
    `WITH planned AS (
       SELECT COALESCE(SUM(planned_effort_days),0) AS request_days,
              COUNT(*) FILTER (WHERE planned_effort_days IS NULL)::int AS unknown_count
       FROM feature_requests
       WHERE organization_id=$1 AND target_period=$2 AND archived_at IS NULL
     )
     SELECT tc.id,tc.total_capacity_days,tc.allocated_days,tc.allocation_reconciliation,
            tc.allocation_reconciled_at,tc.notes,planned.request_days,planned.unknown_count
     FROM planned LEFT JOIN team_capacity tc
       ON tc.organization_id=$1 AND tc.quarter=$2`,
    [organizationId, quarter],
  )
  const row = result.rows[0]
  const total = numberOrNull(row.total_capacity_days) ?? 0
  const legacy = numberOrNull(row.allocated_days) ?? 0
  const requestDays = numberOrNull(row.request_days) ?? 0
  const reconciliation = (row.allocation_reconciliation ?? null) as CapacityReconciliation | null
  const effective = reconciliation === 'REPLACED_BY_REQUESTS'
    ? requestDays
    : reconciliation === 'RETAINED_AS_OUTSIDE_WORK'
      ? legacy + requestDays
      : null
  return {
    quarter,
    configured: Boolean(row.id),
    notes: row.notes ?? null,
    totalCapacityDays: total,
    legacyAllocatedDays: legacy,
    requestDerivedDays: requestDays,
    unknownRequestEstimates: Number(row.unknown_count),
    reconciliation,
    reconciledAt: row.allocation_reconciled_at ?? null,
    effectiveAllocatedDays: effective,
    remainingDays: effective == null ? null : total - effective,
    overAllocatedDays: effective == null ? null : Math.max(effective - total, 0),
  }
}

export async function getCurrentQuarterPlanningCapacity(organizationId: string): Promise<PlanningCapacity> {
  const now = new Date()
  return getPlanningCapacity(organizationId, `${now.getFullYear()}-Q${Math.ceil((now.getMonth() + 1) / 3)}`)
}

export async function reconcilePlanningCapacity(
  organizationId: string,
  quarter: string,
  reconciliation: CapacityReconciliation,
  actorId: string,
): Promise<void> {
  if (!QUARTER.test(quarter)) throw new Error('Quarter must use the YYYY-Q1 format.')
  if (!['REPLACED_BY_REQUESTS', 'RETAINED_AS_OUTSIDE_WORK'].includes(reconciliation)) {
    throw new Error('Invalid capacity reconciliation choice.')
  }
  await transaction(async () => {
    await requireCurrentRole(organizationId, actorId, 'ADMIN')
    const current = await query(
      `SELECT allocation_reconciliation FROM team_capacity
       WHERE organization_id=$1 AND quarter=$2 FOR UPDATE`,
      [organizationId, quarter],
    )
    if (!current.rows[0]) throw new Error('Configure capacity for this quarter before reconciling allocation.')
    await query(
      `UPDATE team_capacity SET allocation_reconciliation=$3,
         allocation_reconciled_at=clock_timestamp(),allocation_reconciled_by=$4,updated_at=clock_timestamp()
       WHERE organization_id=$1 AND quarter=$2`,
      [organizationId, quarter, reconciliation, actorId],
    )
    await query(
      `INSERT INTO request_planning_events(organization_id,quarter,actor_id,event_kind,changes)
       VALUES($1,$2,$3,'CAPACITY_RECONCILED',$4)`,
      [organizationId, quarter, actorId, JSON.stringify({
        reconciliation: { from: current.rows[0].allocation_reconciliation, to: reconciliation },
      })],
    )
  })
}
