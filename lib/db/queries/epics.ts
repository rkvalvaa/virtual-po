import { query } from '@/lib/db/pool';
import { mapRow, mapRows } from '@/lib/db/mappers';
import type { Epic, UserStory } from '@/lib/types/database';

export async function createEpic(data: {
  requestId: string;
  title: string;
  description?: string;
  goals?: string[];
  successCriteria?: string[];
  technicalNotes?: string;
}): Promise<Epic> {
  const result = await query(
    `INSERT INTO epics (request_id, title, description, goals, success_criteria, technical_notes)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [
      data.requestId,
      data.title,
      data.description ?? null,
      data.goals ?? [],
      data.successCriteria ?? [],
      data.technicalNotes ?? null,
    ]
  );
  return mapRow<Epic>(result.rows[0]);
}

export async function getEpicByRequestId(
  requestId: string
): Promise<Epic | null> {
  const result = await query(
    `SELECT * FROM epics WHERE request_id = $1`,
    [requestId]
  );
  if (result.rows.length === 0) return null;
  return mapRow<Epic>(result.rows[0]);
}

export async function updateEpic(
  id: string,
  data: Partial<Pick<Epic, 'title' | 'description' | 'goals' | 'successCriteria' | 'technicalNotes'>>
): Promise<Epic> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (data.title !== undefined) {
    fields.push(`title = $${paramIndex++}`);
    values.push(data.title);
  }
  if (data.description !== undefined) {
    fields.push(`description = $${paramIndex++}`);
    values.push(data.description);
  }
  if (data.goals !== undefined) {
    fields.push(`goals = $${paramIndex++}`);
    values.push(data.goals);
  }
  if (data.successCriteria !== undefined) {
    fields.push(`success_criteria = $${paramIndex++}`);
    values.push(data.successCriteria);
  }
  if (data.technicalNotes !== undefined) {
    fields.push(`technical_notes = $${paramIndex++}`);
    values.push(data.technicalNotes);
  }

  if (fields.length === 0) {
    const existing = await query(`SELECT * FROM epics WHERE id = $1`, [id]);
    return mapRow<Epic>(existing.rows[0]);
  }

  fields.push(`updated_at = NOW()`);
  values.push(id);

  const result = await query(
    `UPDATE epics SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );
  return mapRow<Epic>(result.rows[0]);
}

export async function createUserStory(data: {
  epicId: string;
  title: string;
  asA: string;
  iWant: string;
  soThat: string;
  acceptanceCriteria?: string[];
  technicalNotes?: string;
  priority?: number;
  storyPoints?: number;
}): Promise<UserStory> {
  const result = await query(
    `INSERT INTO user_stories (epic_id, title, as_a, i_want, so_that, acceptance_criteria, technical_notes, priority, story_points)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      data.epicId,
      data.title,
      data.asA,
      data.iWant,
      data.soThat,
      data.acceptanceCriteria ?? [],
      data.technicalNotes ?? null,
      data.priority ?? 0,
      data.storyPoints ?? null,
    ]
  );
  return mapRow<UserStory>(result.rows[0]);
}

export async function getStoriesByEpicId(
  epicId: string
): Promise<UserStory[]> {
  const result = await query(
    `SELECT * FROM user_stories WHERE epic_id = $1 ORDER BY priority ASC, created_at ASC`,
    [epicId]
  );
  return mapRows<UserStory>(result.rows);
}

export async function updateUserStory(
  id: string,
  data: Partial<UserStory>
): Promise<UserStory> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (data.title !== undefined) {
    fields.push(`title = $${paramIndex++}`);
    values.push(data.title);
  }
  if (data.asA !== undefined) {
    fields.push(`as_a = $${paramIndex++}`);
    values.push(data.asA);
  }
  if (data.iWant !== undefined) {
    fields.push(`i_want = $${paramIndex++}`);
    values.push(data.iWant);
  }
  if (data.soThat !== undefined) {
    fields.push(`so_that = $${paramIndex++}`);
    values.push(data.soThat);
  }
  if (data.acceptanceCriteria !== undefined) {
    fields.push(`acceptance_criteria = $${paramIndex++}`);
    values.push(data.acceptanceCriteria);
  }
  if (data.technicalNotes !== undefined) {
    fields.push(`technical_notes = $${paramIndex++}`);
    values.push(data.technicalNotes);
  }
  if (data.priority !== undefined) {
    fields.push(`priority = $${paramIndex++}`);
    values.push(data.priority);
  }
  if (data.storyPoints !== undefined) {
    fields.push(`story_points = $${paramIndex++}`);
    values.push(data.storyPoints);
  }

  if (fields.length === 0) {
    const existing = await query(`SELECT * FROM user_stories WHERE id = $1`, [id]);
    return mapRow<UserStory>(existing.rows[0]);
  }

  fields.push(`updated_at = NOW()`);
  values.push(id);

  const result = await query(
    `UPDATE user_stories SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );
  return mapRow<UserStory>(result.rows[0]);
}

export async function deleteUserStory(id: string): Promise<void> {
  await query(`DELETE FROM user_stories WHERE id = $1`, [id]);
}
