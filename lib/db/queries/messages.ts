import { query } from '@/lib/db/pool';
import { mapRow, mapRows } from '@/lib/db/mappers';
import type { Message } from '@/lib/types/database';

export async function createMessage(
  conversationId: string,
  role: Message['role'],
  content: string,
  toolCalls?: unknown,
  toolResults?: unknown
): Promise<Message> {
  const result = await query(
    `INSERT INTO messages (conversation_id, role, content, tool_calls, tool_results)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [conversationId, role, content, toolCalls ?? null, toolResults ?? null]
  );
  return mapRow<Message>(result.rows[0]);
}

export async function getMessagesByConversationId(
  conversationId: string
): Promise<Message[]> {
  const result = await query(
    `SELECT * FROM messages
     WHERE conversation_id = $1
     ORDER BY created_at ASC`,
    [conversationId]
  );
  return mapRows<Message>(result.rows);
}
