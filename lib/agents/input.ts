import { z } from 'zod';
import type { UIMessage } from 'ai';
import { NextResponse } from 'next/server';
import { AgentAccessError } from './runs';
import { AGENT_LIMITS } from './limits';

const part = z.object({ type: z.string().min(1).max(128), text: z.string().max(16_000).optional() }).passthrough();
const bodySchema = z.object({
  requestId: z.uuid().optional(),
  messages: z.array(z.object({ id: z.string().min(1).max(128), role: z.enum(['user', 'assistant']),
    parts: z.array(part).max(100) })).max(AGENT_LIMITS.messageCount),
});

export const isAgentRequestId = (id: unknown): id is string => z.uuid().safeParse(id).success;

export async function readAgentBody(request: Request): Promise<{ requestId?: string; messages: UIMessage[] }> {
  const reader = request.body?.getReader();
  if (!reader) throw new AgentAccessError('A JSON request body is required.', 400);
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > AGENT_LIMITS.bodyBytes) {
        await reader.cancel();
        throw new AgentAccessError('Message payload is too large. Send a shorter message (maximum 128 KiB).', 413);
      }
      chunks.push(chunk.value);
    }
    const data = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; }
    const parsed = bodySchema.safeParse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data)));
    if (!parsed.success) throw new AgentAccessError('Invalid messages or requestId. Send text messages with valid IDs (maximum 100 messages).', 400);
    const last = parsed.data.messages.at(-1);
    if (last && (last.role !== 'user' || !last.parts.length || last.parts.length > 8 || last.parts.some(p => p.type !== 'text' || !p.text?.trim()))) {
      throw new AgentAccessError('The last message must contain text from the user.', 400);
    }
    return parsed.data as { requestId?: string; messages: UIMessage[] };
  } catch (error) {
    if (error instanceof AgentAccessError) throw error;
    throw new AgentAccessError('Invalid JSON request body.', 400);
  } finally { reader.releaseLock(); }
}

export function agentErrorResponse(error: unknown): Response {
  if (error instanceof AgentAccessError) return NextResponse.json({ error: error.message }, {
    status: error.status, headers: error.retryAfter ? { 'Retry-After': String(error.retryAfter) } : undefined,
  });
  return NextResponse.json({ error: 'Unable to start the agent. Please retry.' }, { status: 500 });
}

export function boundedModelHistory(history: UIMessage[], system: string): UIMessage[] {
  let bytes = Buffer.byteLength(system, 'utf8');
  const selected: UIMessage[] = [];
  for (const message of [...history].reverse()) {
    const size = Buffer.byteLength(JSON.stringify(message), 'utf8');
    if (bytes + size > AGENT_LIMITS.inputBytes || selected.length >= 40) break;
    selected.unshift(message);
    bytes += size;
  }
  while (selected[0]?.role === 'assistant') selected.shift();
  if (bytes > AGENT_LIMITS.inputBytes || (history.length && !selected.length)) {
    throw new AgentAccessError('Saved request context is too large. Shorten the request details before retrying.', 413);
  }
  return selected;
}
