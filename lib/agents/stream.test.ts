// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { MockLanguageModelV3 } from 'ai/test';
import type { LanguageModelV3StreamPart } from '@ai-sdk/provider';
import { query } from '@/lib/db/pool';
import { createTestOrg, createTestUser, createTestRequest, cleanupTestOrg, hasDb, type TestOrg, type TestUser } from '@/test/db-helpers';
import { createGuardedAgentStream } from './stream';
import { getAgentMessages } from './history';

vi.mock('next/server', async () => ({ ...await vi.importActual<typeof import('next/server')>('next/server'), after: vi.fn() }));
vi.mock('./client', () => ({
  AGENT_MODEL: 'mock',
  anthropic: () => new MockLanguageModelV3({
    doStream: async ({ abortSignal }) => ({
      stream: new ReadableStream<LanguageModelV3StreamPart>({
        start(controller) {
          controller.enqueue({ type: 'stream-start', warnings: [] });
          controller.enqueue({ type: 'text-start', id: 'part' });
          controller.enqueue({ type: 'text-delta', id: 'part', delta: 'Partial saved reply' });
          abortSignal?.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')), { once: true });
        },
      }),
    }),
  }),
}));

describe.skipIf(!hasDb())('real SDK stream cancellation', () => {
  let org: TestOrg, user: TestUser;
  beforeAll(async () => { org = await createTestOrg('stream-cancel'); user = await createTestUser(org); });
  afterAll(async () => { await cleanupTestOrg(org, [user.id]); });
  it('marks a partially consumed response failed and retains the submitted message', async () => {
    const request = await createTestRequest(org, user);
    const scope = { requestId: request.id, orgId: org.id, userId: user.id, agent: 'intake' as const };
    const response = await createGuardedAgentStream({ scope, system: 'Test', signal: new AbortController().signal,
      messages: [{ id: 'user-1', role: 'user', parts: [{ type: 'text', text: 'Recover this message' }] }], createTools: () => ({}) });
    const reader = response.body!.getReader();
    let received = '';
    while (!received.includes('Partial saved reply')) {
      const chunk = await reader.read();
      expect(chunk.done).toBe(false);
      received += new TextDecoder().decode(chunk.value);
    }
    await reader.cancel('Navigated away');
    expect((await query('SELECT status FROM agent_runs WHERE request_id = $1', [request.id])).rows).toEqual([{ status: 'FAILED' }]);
    expect((await getAgentMessages(scope))[0]).toMatchObject({ id: 'user-1', role: 'user' });
  });
});
