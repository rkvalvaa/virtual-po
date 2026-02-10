import { query } from '@/lib/db/pool';
import { mapRow, mapRows } from '@/lib/db/mappers';
import type { Conversation, AgentType } from '@/lib/types/database';

export async function createConversation(
  requestId: string,
  agentType: AgentType
): Promise<Conversation> {
  const result = await query(
    `INSERT INTO conversations (request_id, agent_type)
     VALUES ($1, $2)
     RETURNING *`,
    [requestId, agentType]
  );
  return mapRow<Conversation>(result.rows[0]);
}

export async function getConversationById(id: string): Promise<Conversation | null> {
  const result = await query(
    `SELECT * FROM conversations WHERE id = $1`,
    [id]
  );
  if (result.rows.length === 0) return null;
  return mapRow<Conversation>(result.rows[0]);
}

export async function getConversationsByRequestId(
  requestId: string
): Promise<Conversation[]> {
  const result = await query(
    `SELECT * FROM conversations WHERE request_id = $1 ORDER BY created_at`,
    [requestId]
  );
  return mapRows<Conversation>(result.rows);
}

export async function updateConversationStatus(
  id: string,
  status: 'ACTIVE' | 'COMPLETED' | 'ABANDONED'
): Promise<Conversation> {
  const result = await query(
    `UPDATE conversations
     SET status = $1,
         updated_at = NOW(),
         completed_at = ${status === 'COMPLETED' ? 'NOW()' : 'completed_at'}
     WHERE id = $2
     RETURNING *`,
    [status, id]
  );
  return mapRow<Conversation>(result.rows[0]);
}
