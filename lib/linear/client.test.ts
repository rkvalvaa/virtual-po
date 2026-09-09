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

it('polls updated team issues incrementally with a cursor and updated timestamps', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ data: { issues: {
    nodes: [{ id: 'issue-1', identifier: 'ENG-1', title: 'Issue', description: null, url: 'https://linear/ENG-1', priority: 3, updatedAt: '2026-09-09T09:00:00.000Z', state: { id: 'done', name: 'Done' }, project: null, labels: { nodes: [] } }],
    pageInfo: { hasNextPage: true, endCursor: 'next-page' },
  } } }))
  vi.stubGlobal('fetch', fetch)
  const page = await createLinearClient({ apiKey: 'test-only' }).listUpdatedIssuesPage('team-1', new Date('2026-09-09T08:55:00Z'), { cursor: 'current', pageSize: 50 })
  expect(page.nextCursor).toBe('next-page')
  expect(page.items[0]).toMatchObject({ id: 'issue-1', updatedAt: '2026-09-09T09:00:00.000Z' })
  expect(JSON.parse(fetch.mock.calls[0][1].body as string).variables).toEqual({ teamId: 'team-1', updatedAfter: '2026-09-09T08:55:00.000Z', first: 50, after: 'current' })
})
