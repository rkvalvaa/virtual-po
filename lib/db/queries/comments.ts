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

export interface CommentWithAuthor extends Comment {
  authorName: string;
  mentionNames: string[];
}

export async function getCommentsWithAuthorByRequestId(
  requestId: string
): Promise<CommentWithAuthor[]> {
  const result = await query(
    `SELECT c.*, u.name AS author_name,
            COALESCE(
              ARRAY_AGG(cm.display_name ORDER BY cm.display_name)
                FILTER (WHERE cm.mentioned_user_id IS NOT NULL),
              ARRAY[]::text[]
            ) AS mention_names
     FROM comments c
     LEFT JOIN users u ON c.author_id = u.id
     LEFT JOIN comment_mentions cm ON cm.comment_id = c.id
     WHERE c.request_id = $1
     GROUP BY c.id, u.name
     ORDER BY c.created_at ASC`,
    [requestId]
  );
  return mapRows<CommentWithAuthor>(result.rows);
}
