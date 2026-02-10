import { query } from '@/lib/db/pool';
import { mapRow } from '@/lib/db/mappers';
import type { User } from '@/lib/types/database';

export async function createUser(
  email: string,
  name?: string,
  avatarUrl?: string
): Promise<User> {
  const result = await query(
    `INSERT INTO users (email, name, avatar_url)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [email, name ?? null, avatarUrl ?? null]
  );
  return mapRow<User>(result.rows[0]);
}

export async function getUserById(id: string): Promise<User | null> {
  const result = await query(
    `SELECT * FROM users WHERE id = $1`,
    [id]
  );
  if (result.rows.length === 0) return null;
  return mapRow<User>(result.rows[0]);
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const result = await query(
    `SELECT * FROM users WHERE email = $1`,
    [email]
  );
  if (result.rows.length === 0) return null;
  return mapRow<User>(result.rows[0]);
}

export async function updateUser(
  id: string,
  data: Partial<Pick<User, 'name' | 'avatarUrl'>>
): Promise<User> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (data.name !== undefined) {
    fields.push(`name = $${paramIndex++}`);
    values.push(data.name);
  }
  if (data.avatarUrl !== undefined) {
    fields.push(`avatar_url = $${paramIndex++}`);
    values.push(data.avatarUrl);
  }

  fields.push(`updated_at = NOW()`);
  values.push(id);

  const result = await query(
    `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );
  return mapRow<User>(result.rows[0]);
}
