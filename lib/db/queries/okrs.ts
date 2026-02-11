import { query } from '@/lib/db/pool';
import { mapRow, mapRows } from '@/lib/db/mappers';
import type { Objective, KeyResult, OkrStatus } from '@/lib/types/database';

export async function createObjective(
  orgId: string,
  title: string,
  description: string | null,
  timeFrame: string,
  createdBy: string | null
): Promise<Objective> {
  const result = await query(
    `INSERT INTO objectives (organization_id, title, description, time_frame, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [orgId, title, description, timeFrame, createdBy]
  );
  return mapRow<Objective>(result.rows[0]);
}

export async function updateObjective(
  id: string,
  fields: { title?: string; description?: string; timeFrame?: string; status?: OkrStatus }
): Promise<Objective> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (fields.title !== undefined) {
    setClauses.push(`title = $${paramIndex++}`);
    values.push(fields.title);
  }
  if (fields.description !== undefined) {
    setClauses.push(`description = $${paramIndex++}`);
    values.push(fields.description);
  }
  if (fields.timeFrame !== undefined) {
    setClauses.push(`time_frame = $${paramIndex++}`);
    values.push(fields.timeFrame);
  }
  if (fields.status !== undefined) {
    setClauses.push(`status = $${paramIndex++}`);
    values.push(fields.status);
  }

  if (setClauses.length === 0) {
    const existing = await query(`SELECT * FROM objectives WHERE id = $1`, [id]);
    return mapRow<Objective>(existing.rows[0]);
  }

  setClauses.push(`updated_at = NOW()`);
  values.push(id);

  const result = await query(
    `UPDATE objectives SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );
  return mapRow<Objective>(result.rows[0]);
}

export async function deleteObjective(id: string): Promise<void> {
  await query(`DELETE FROM objectives WHERE id = $1`, [id]);
}

export async function getObjectivesByOrgId(orgId: string): Promise<Objective[]> {
  const result = await query(
    `SELECT * FROM objectives WHERE organization_id = $1 ORDER BY created_at DESC`,
    [orgId]
  );
  return mapRows<Objective>(result.rows);
}

export async function getObjectiveById(id: string): Promise<Objective | null> {
  const result = await query(
    `SELECT * FROM objectives WHERE id = $1`,
    [id]
  );
  if (result.rows.length === 0) return null;
  return mapRow<Objective>(result.rows[0]);
}

export async function getActiveObjectives(orgId: string): Promise<Objective[]> {
  const result = await query(
    `SELECT * FROM objectives WHERE organization_id = $1 AND status = 'ACTIVE' ORDER BY created_at DESC`,
    [orgId]
  );
  return mapRows<Objective>(result.rows);
}

export async function getKeyResultsByObjectiveId(objectiveId: string): Promise<KeyResult[]> {
  const result = await query(
    `SELECT * FROM key_results WHERE objective_id = $1 ORDER BY created_at ASC`,
    [objectiveId]
  );
  return mapRows<KeyResult>(result.rows);
}

export async function createKeyResult(
  objectiveId: string,
  title: string,
  targetValue: number,
  unit: string
): Promise<KeyResult> {
  const result = await query(
    `INSERT INTO key_results (objective_id, title, target_value, unit)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [objectiveId, title, targetValue, unit]
  );
  return mapRow<KeyResult>(result.rows[0]);
}

export async function updateKeyResult(
  id: string,
  fields: { title?: string; targetValue?: number; currentValue?: number; unit?: string }
): Promise<KeyResult> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (fields.title !== undefined) {
    setClauses.push(`title = $${paramIndex++}`);
    values.push(fields.title);
  }
  if (fields.targetValue !== undefined) {
    setClauses.push(`target_value = $${paramIndex++}`);
    values.push(fields.targetValue);
  }
  if (fields.currentValue !== undefined) {
    setClauses.push(`current_value = $${paramIndex++}`);
    values.push(fields.currentValue);
  }
  if (fields.unit !== undefined) {
    setClauses.push(`unit = $${paramIndex++}`);
    values.push(fields.unit);
  }

  if (setClauses.length === 0) {
    const existing = await query(`SELECT * FROM key_results WHERE id = $1`, [id]);
    return mapRow<KeyResult>(existing.rows[0]);
  }

  setClauses.push(`updated_at = NOW()`);
  values.push(id);

  const result = await query(
    `UPDATE key_results SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );
  return mapRow<KeyResult>(result.rows[0]);
}

export async function deleteKeyResult(id: string): Promise<void> {
  await query(`DELETE FROM key_results WHERE id = $1`, [id]);
}

export async function getObjectivesWithKeyResults(
  orgId: string
): Promise<(Objective & { keyResults: KeyResult[] })[]> {
  const objectivesResult = await query(
    `SELECT * FROM objectives WHERE organization_id = $1 ORDER BY created_at DESC`,
    [orgId]
  );
  const objectives = mapRows<Objective>(objectivesResult.rows);

  if (objectives.length === 0) return [];

  const objectiveIds = objectives.map((o) => o.id);
  const krResult = await query(
    `SELECT * FROM key_results WHERE objective_id = ANY($1) ORDER BY created_at ASC`,
    [objectiveIds]
  );
  const keyResults = mapRows<KeyResult>(krResult.rows);

  const krByObjective = new Map<string, KeyResult[]>();
  for (const kr of keyResults) {
    const existing = krByObjective.get(kr.objectiveId) ?? [];
    existing.push(kr);
    krByObjective.set(kr.objectiveId, existing);
  }

  return objectives.map((obj) => ({
    ...obj,
    keyResults: krByObjective.get(obj.id) ?? [],
  }));
}
