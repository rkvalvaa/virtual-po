import { query } from '@/lib/db/pool';
import { mapRow, mapRows } from '@/lib/db/mappers';
import type { TeamCapacity } from '@/lib/types/database';

export async function getCapacityByOrgId(
  orgId: string,
  quarter?: string
): Promise<TeamCapacity[]> {
  if (quarter) {
    const result = await query(
      `SELECT * FROM team_capacity WHERE organization_id = $1 AND quarter = $2`,
      [orgId, quarter]
    );
    return mapRows<TeamCapacity>(result.rows);
  }

  const result = await query(
    `SELECT * FROM team_capacity WHERE organization_id = $1 ORDER BY quarter DESC`,
    [orgId]
  );
  return mapRows<TeamCapacity>(result.rows);
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
       notes = EXCLUDED.notes,
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()
     RETURNING *`,
    [orgId, quarter, totalCapacityDays, allocatedDays, notes, updatedBy]
  );
  return mapRow<TeamCapacity>(result.rows[0]);
}

export async function getCurrentQuarterCapacity(
  orgId: string
): Promise<TeamCapacity[]> {
  const now = new Date();
  const q = Math.ceil((now.getMonth() + 1) / 3);
  const quarter = `${now.getFullYear()}-Q${q}`;
  return getCapacityByOrgId(orgId, quarter);
}
