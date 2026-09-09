import type { UIMessage } from 'ai';
import { z } from 'zod';
import { query, transaction } from '@/lib/db/pool';
import { AgentAccessError, lockAuthorizedRequest, withAgentMutation, type AgentScope, type AgentRunScope } from './runs';

const incomingUserMessage = z.object({
  id: z.string().min(1).max(128),
  role: z.literal('user'),
  parts: z.array(z.object({ type: z.literal('text'), text: z.string().min(1).max(16_000) })).min(1).max(8),
});
const conversationType = (scope: AgentScope) => scope.agent === 'security' ? 'GENERAL' : scope.agent.toUpperCase();

async function conversationId(scope: AgentScope): Promise<string> {
  // Callers hold the request lock, so legacy drafts and concurrent retries share one conversation.
  const existing = await query(`SELECT id FROM conversations WHERE request_id = $1 AND agent_type = $2
    ORDER BY created_at, id LIMIT 1`, [scope.requestId, conversationType(scope)]);
  if (existing.rows[0]) return existing.rows[0].id;
  const created = await query(`INSERT INTO conversations(request_id, agent_type) VALUES ($1, $2) RETURNING id`,
    [scope.requestId, conversationType(scope)]);
  return created.rows[0].id;
}

async function readMessages(id: string): Promise<UIMessage[]> {
  const rows = await query(`SELECT id, client_message_id, role, content, ui_parts FROM messages
    WHERE conversation_id = $1 AND role IN ('USER', 'ASSISTANT') ORDER BY message_order`, [id]);
  return rows.rows.map(row => ({ id: row.client_message_id ?? row.id,
    role: row.role.toLowerCase() as 'user' | 'assistant',
    parts: row.ui_parts ?? [{ type: 'text', text: row.content }] }));
}

async function insertMessage(id: string, message: UIMessage): Promise<void> {
  // Source text belongs only to the selected attachment context. Keeping a copy
  // in history would defeat deselection/deletion and replay stale evidence.
  const parts = message.parts.map(part => {
    if (part.type !== 'tool-get_supporting_documents' &&
      !(part.type === 'dynamic-tool' && part.toolName === 'get_supporting_documents')) return part;
    if (!('output' in part) || !part.output || typeof part.output !== 'object') return part;
    const output = part.output as Record<string, unknown>;
    const sources = Array.isArray(output.sources) ? output.sources.map(source => {
      if (!source || typeof source !== 'object') return {};
      const { attachmentId, filename, contentHash, lineCount, truncated } = source;
      return { attachmentId, filename, contentHash, lineCount, truncated };
    }) : [];
    return { ...part, output: { sources, omitted: output.omitted ?? [], sourceTextOmitted: true,
      instruction: 'Read get_supporting_documents again for current source text before citing.' } };
  });
  await query(`INSERT INTO messages(conversation_id, client_message_id, role, content, ui_parts)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (conversation_id, client_message_id) WHERE client_message_id IS NOT NULL
    DO UPDATE SET content = EXCLUDED.content, ui_parts = EXCLUDED.ui_parts
    WHERE messages.role = 'ASSISTANT' AND EXCLUDED.role = 'ASSISTANT'`,
    [id, message.id, message.role.toUpperCase(),
      message.parts.filter(p => p.type === 'text').map(p => p.text).join('\n'), JSON.stringify(parts)]);
}

export async function getAgentMessages(scope: AgentScope): Promise<UIMessage[]> {
  return transaction(async () => {
    await lockAuthorizedRequest(scope);
    const existing = await query(`SELECT id FROM conversations WHERE request_id = $1 AND agent_type = $2
      ORDER BY created_at, id LIMIT 1`, [scope.requestId, conversationType(scope)]);
    return existing.rows[0] ? readMessages(existing.rows[0].id) : [];
  });
}

export async function prepareAgentMessages(scope: AgentRunScope, clientMessages: UIMessage[]): Promise<UIMessage[]> {
  const last = clientMessages.at(-1);
  const parsed = last ? incomingUserMessage.safeParse(last) : null;
  if (parsed && !parsed.success) throw new AgentAccessError('Send a text message of at most 16,000 characters per part.', 400);
  return withAgentMutation(scope, async () => {
    const id = await conversationId(scope);
    if (parsed?.success) await insertMessage(id, parsed.data);
    return readMessages(id);
  }, true);
}

export async function saveAgentReply(scope: AgentRunScope, message: UIMessage): Promise<void> {
  if (message.role !== 'assistant') throw new AgentAccessError('Invalid agent reply', 400);
  if (!message.id) throw new AgentAccessError('Agent reply is missing its identity', 400);
  if (!message.parts.length) return;
  await withAgentMutation(scope, async () => {
    await insertMessage(await conversationId(scope), message);
  }, true);
}
