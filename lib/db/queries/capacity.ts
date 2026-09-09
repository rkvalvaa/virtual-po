import { query } from '@/lib/db/pool';
import { mapRow } from '@/lib/db/mappers';
import type { TeamCapacity } from '@/lib/types/database';

function mapCapacity(row: Record<string, unknown>): TeamCapacity {
  const capacity = mapRow<TeamCapacity>(row);
  return {
    ...capacity,
    totalCapacityDays: Number(capacity.totalCapacityDays),
    allocatedDays: Number(capacity.allocatedDays),
  };
}

export async function getCapacityByOrgId(
  orgId: string,
  quarter?: string
): Promise<TeamCapacity[]> {
  if (quarter) {
    const result = await query(
      `SELECT * FROM team_capacity WHERE organization_id = $1 AND quarter = $2`,
      [orgId, quarter]
    );
    return result.rows.map(mapCapacity);
  }

  const result = await query(
    `SELECT * FROM team_capacity WHERE organization_id = $1 ORDER BY quarter DESC`,
    [orgId]
  );
  return result.rows.map(mapCapacity);
}

export async function upsertCapacity(
  orgId: string,
  quarter: string,
  totalCapacityDays: number,
  allocatedDays: number,
  notes: string | null,
  updatedBy: string | null
): Promise<TeamCapacity> {
  const result = await query(
    `INSERT INTO team_capacity (organization_id, quarter, total_capacity_days, allocated_days, notes, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (organization_id, quarter)
     DO UPDATE SET
       total_capacity_days = EXCLUDED.total_capacity_days,
       allocated_days = EXCLUDED.allocated_days,
       allocation_reconciliation = CASE
         WHEN team_capacity.allocated_days IS DISTINCT FROM EXCLUDED.allocated_days THEN NULL
         ELSE team_capacity.allocation_reconciliation END,
       allocation_reconciled_at = CASE
         WHEN team_capacity.allocated_days IS DISTINCT FROM EXCLUDED.allocated_days THEN NULL
         ELSE team_capacity.allocation_reconciled_at END,
       allocation_reconciled_by = CASE
         WHEN team_capacity.allocated_days IS DISTINCT FROM EXCLUDED.allocated_days THEN NULL
         ELSE team_capacity.allocation_reconciled_by END,
       notes = EXCLUDED.notes,
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()
     RETURNING *`,
    [orgId, quarter, totalCapacityDays, allocatedDays, notes, updatedBy]
  );
  return mapCapacity(result.rows[0]);
}

export async function getCurrentQuarterCapacity(
  orgId: string
): Promise<TeamCapacity[]> {
  const now = new Date();
  const q = Math.ceil((now.getMonth() + 1) / 3);
  const quarter = `${now.getFullYear()}-Q${q}`;
  return getCapacityByOrgId(orgId, quarter);
}
