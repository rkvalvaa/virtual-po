// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { createLinearClient } from './client';
import { ExportRejected } from '@/lib/export/errors';
afterEach(() => vi.unstubAllGlobals());

it('classifies a pre-execution rejection as safe to retry while keeping partial data ambiguous', async () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  const client = createLinearClient({ apiKey: 'test-only' });
  for (const code of ['GRAPHQL_VALIDATION_FAILED', 'RATELIMITED']) {
    fetch.mockResolvedValueOnce(Response.json({ errors: [{ message: 'Rejected', extensions: { code } }] }));
    await expect(client.createProject('team', 'Title', 'Body', 'id')).rejects.toBeInstanceOf(ExportRejected);
  }
  fetch.mockResolvedValueOnce(Response.json({ data: { projectCreate: { project: { id: 'created' } } }, errors: [{ message: 'Partial response failure', extensions: { code: 'GRAPHQL_VALIDATION_FAILED' } }] }));
  await expect(client.createProject('team', 'Title')).rejects.not.toBeInstanceOf(ExportRejected);
});
