// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { boundedModelHistory, readAgentBody } from './input';
import { AGENT_LIMITS } from './limits';

const message = { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] };
const request = (body: unknown) => new Request('http://localhost', { method: 'POST', body: JSON.stringify(body) });
describe('bounded agent input', () => {
  it('accepts a text message and optional request id', async () => {
    expect(await readAgentBody(request({ messages: [message] }))).toMatchObject({ messages: [message] });
  });
  it.each([null, { messages: [null] }, { messages: [{ ...message, role: 'system' }] },
    { messages: [{ ...message, parts: [{ type: 'text', text: 3 }] }] },
    { messages: Array(101).fill(message) }, { messages: [], requestId: 'invalid' }])('rejects malformed input %#', async body => {
    await expect(readAgentBody(request(body))).rejects.toMatchObject({ status: 400 });
  });
  it('bounds actual bytes even without content-length', async () => {
    await expect(readAgentBody(request({ messages: [message], padding: 'x'.repeat(128 * 1024) }))).rejects.toMatchObject({ status: 413 });
  });
  it('bounds model history without changing the saved conversation', () => {
    const history = Array.from({ length: 61 }, (_, index) => ({ id: String(index),
      role: index % 2 ? 'assistant' as const : 'user' as const,
      parts: [{ type: 'text' as const, text: 'A saved conversation turn' }] }));
    const selected = boundedModelHistory(history, 'Saved request context');
    expect(selected.length).toBeLessThanOrEqual(40);
    expect(selected[0].role).toBe('user');
    expect(selected.at(-1)?.id).toBe('60');
    expect(history).toHaveLength(61);
  });
  it('rejects request context that cannot fit the model budget', () => {
    expect(() => boundedModelHistory([], 'x'.repeat(AGENT_LIMITS.inputBytes + 1))).toThrow(/context is too large/);
  });
});
