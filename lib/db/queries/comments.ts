import { query } from '@/lib/db/pool';
import { mapRow, mapRows } from '@/lib/db/mappers';
import type { Comment } from '@/lib/types/database';

export async function createComment(
  requestId: string,
  authorId: string,
  content: string,
  parentId?: string
): Promise<Comment> {
  const result = await query(
    `INSERT INTO comments (request_id, author_id, content, parent_id)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [requestId, authorId, content, parentId ?? null]
  );
  return mapRow<Comment>(result.rows[0]);
}

export async function getCommentsByRequestId(
  requestId: string
): Promise<Comment[]> {
  const result = await query(
    `SELECT * FROM comments
     WHERE request_id = $1
     ORDER BY created_at ASC`,
    [requestId]
  );
  return mapRows<Comment>(result.rows);
}
