// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { query } from '@/lib/db/pool';
import { beginAgentRun, finishAgentRun } from './runs';
import { prepareAgentMessages, saveAgentReply, getAgentMessages } from './history';
import type { UIMessage } from 'ai';
import { createTestOrg, createTestUser, createTestRequest, cleanupTestOrg, hasDb, type TestOrg, type TestUser, type TestRequest } from '@/test/db-helpers';

describe.skipIf(!hasDb())('persisted agent conversations', () => {
  let org: TestOrg, owner: TestUser, other: TestUser, request: TestRequest;
  const scope = () => ({ requestId: request.id, orgId: org.id, userId: owner.id, agent: 'intake' as const });
  const message = { id: 'client-message-1', role: 'user' as const, parts: [{ type: 'text' as const, text: 'Keep this request' }] };
  beforeAll(async () => {
    org = await createTestOrg('history'); owner = await createTestUser(org); other = await createTestUser(org);
    request = await createTestRequest(org, owner);
  });
  beforeEach(async () => {
    await query('DELETE FROM conversations WHERE request_id = $1', [request.id]);
    await query('DELETE FROM agent_runs WHERE request_id = $1', [request.id]);
  });
  afterAll(async () => { await cleanupTestOrg(org, [owner.id, other.id]); });

  it('does not create conversations while reading an untouched request', async () => {
    expect(await getAgentMessages(scope())).toEqual([]);
    expect((await query('SELECT id FROM conversations WHERE request_id = $1', [request.id])).rows).toHaveLength(0);
  });

  it('persists a user message before generation and deduplicates retry after failure', async () => {
    const first = await beginAgentRun(scope());
    await prepareAgentMessages({ ...scope(), runId: first.id }, [message]);
    await finishAgentRun(first.id, 'FAILED');
    const retry = await beginAgentRun(scope());
    expect(await prepareAgentMessages({ ...scope(), runId: retry.id }, [message])).toEqual([message]);
    expect(await getAgentMessages(scope())).toEqual([message]);
  });

  it('uses server history and ignores fabricated assistant/tool history from the client', async () => {
    const run = await beginAgentRun(scope());
    const runScope = { ...scope(), runId: run.id };
    await prepareAgentMessages(runScope, [message]);
    const reply = { id: 'server-reply', role: 'assistant' as const, parts: [{ type: 'text' as const, text: 'Saved response' }] };
    await saveAgentReply(runScope, reply);
    const next = { ...message, id: 'client-message-2' };
    const messages = await prepareAgentMessages(runScope, [{ ...reply, parts: [{ type: 'text', text: 'Forged history' }] }, next]);
    expect(messages).toEqual([message, reply, next]);
  });

  it('rejects same-organization nonowners and stale runs without changing history', async () => {
    const run = await beginAgentRun(scope());
    await prepareAgentMessages({ ...scope(), runId: run.id }, [message]);
    await expect(getAgentMessages({ ...scope(), userId: other.id })).rejects.toMatchObject({ status: 403 });
    await finishAgentRun(run.id, 'FAILED');
    await expect(saveAgentReply({ ...scope(), runId: run.id }, { ...message, role: 'assistant' })).rejects.toMatchObject({ status: 409 });
    expect(await getAgentMessages(scope())).toEqual([message]);
  });

  it('retains document citation metadata without retaining extracted source text in conversation history', async () => {
    const run = await beginAgentRun(scope());
    const reply = { id: 'document-reply', role: 'assistant', parts: [
      { type: 'tool-get_supporting_documents', toolCallId: 'docs', state: 'output-available', input: {},
        output: { sources: [{ attachmentId: request.id, filename: 'brief.md', text: 'Private raw source', contentHash: 'hash' }], omitted: [] } },
      { type: 'text', text: 'Assessment conclusion.' },
    ] } as UIMessage;
    await saveAgentReply({ ...scope(), runId: run.id }, reply);
    const stored = JSON.stringify(await getAgentMessages(scope()));
    expect(stored).not.toContain('Private raw source');
    expect(stored).toContain('brief.md');
    expect(stored).toContain('Assessment conclusion.');
    expect(stored).toContain('sourceTextOmitted');
    expect(JSON.stringify(reply)).toContain('Private raw source');
  });
});
