// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanupTestOrg, createTestOrg, createTestRequest, createTestUser, hasDb, type TestOrg, type TestUser } from '@/test/db-helpers';
import { runExport, type ExportAdapter } from './durable';
import { createLinearClient } from '@/lib/linear/client';

describe.skipIf(!hasDb())('durable tracker exports', () => {
  let org: TestOrg, user: TestUser;
  beforeAll(async () => { org = await createTestOrg(); user = await createTestUser(org, 'REVIEWER'); });
  afterAll(async () => { await cleanupTestOrg(org, [user.id]); });
  async function fixture() {
    const request = await createTestRequest(org, user);
    const adapter: ExportAdapter = { create: vi.fn(async item => ({ id: item.id, url: 'https://example.test/' + item.id })), recover: vi.fn(async () => null), finish: vi.fn(async () => {}) };
    const input = { requestId: request.id, orgId: org.id, userId: user.id, provider: 'LINEAR' as const, destination: 'team', items: [{ entityId: request.id, kind: 'EPIC' as const, title: 'Epic', body: 'Full content' }, { entityId: user.id, kind: 'STORY' as const, title: 'Story', body: 'Criteria and estimates' }] };
    return { adapter, input };
  }
  it('persists completion and repeated exports do not create again', async () => {
    const { adapter, input } = await fixture();
    expect((await runExport(input, adapter)).status).toBe('complete');
    expect((await runExport(input, adapter)).status).toBe('complete');
    expect(adapter.create).toHaveBeenCalledTimes(2);
  });
  it('reports partial failure and recovers a timeout after provider success', async () => {
    const { adapter, input } = await fixture();
    vi.mocked(adapter.create).mockImplementation(async item => { if (item.kind === 'STORY') throw new Error('timeout'); return { id: 'parent', url: 'https://example.test/parent' }; });
    const first = await runExport(input, adapter);
    expect(first.status).toBe('partial');
    expect(first.items[1].state).toBe('unknown');
    vi.mocked(adapter.recover).mockResolvedValue({ id: 'recovered', url: 'https://example.test/recovered' });
    expect((await runExport(input, adapter)).status).toBe('complete');
    expect(adapter.create).toHaveBeenCalledTimes(2);
  });
  it('does not recreate an ambiguous missing result or permit a changed destination', async () => {
    const { adapter, input } = await fixture();
    vi.mocked(adapter.create).mockRejectedValue(new Error('timeout'));
    expect((await runExport(input, adapter)).status).toBe('failed');
    expect((await runExport(input, adapter)).status).toBe('failed');
    expect(adapter.create).toHaveBeenCalledTimes(1);
    await expect(runExport({ ...input, destination: 'elsewhere' }, adapter)).rejects.toThrow('destination');
  });
  it('serializes concurrent callers and retries linking without recreating', async () => {
    const { adapter, input } = await fixture();
    let release!: () => void;
    const waiting = new Promise<void>(resolve => { release = resolve; });
    let started!: () => void;
    const active = new Promise<void>(resolve => { started = resolve; });
    vi.mocked(adapter.create).mockImplementation(async item => { started(); await waiting; return { id: item.id, url: 'https://example.test' }; });
    const first = runExport(input, adapter);
    await active;
    await expect(runExport(input, adapter)).rejects.toThrow('in progress');
    release();
    vi.mocked(adapter.finish).mockRejectedValueOnce(new Error('link failure'));
    expect((await first).status).toBe('partial');
    expect((await runExport(input, adapter)).status).toBe('complete');
    expect(adapter.create).toHaveBeenCalledTimes(2);
  });
  it('retries a definitively rejected Linear creation through the real client', async () => {
    const { adapter, input } = await fixture();
    const fetch = vi.spyOn(globalThis, 'fetch');
    const client = createLinearClient({ apiKey: 'test' });
    input.items = input.items.slice(0, 1);
    adapter.create = item => client.createProject('team', item.title, item.body, item.id);
    try {
      fetch.mockResolvedValueOnce(Response.json({ errors: [{ message: 'Rate limited', extensions: { code: 'RATELIMITED' } }] }));
      expect((await runExport(input, adapter)).items[0].state).toBe('ready');
      fetch.mockResolvedValueOnce(Response.json({ data: { projectCreate: { project: { id: 'project', url: 'https://linear.app/project' } } } }));
      expect((await runExport(input, adapter)).status).toBe('complete');
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(adapter.recover).not.toHaveBeenCalled();
    } finally { fetch.mockRestore(); }
  });
});
