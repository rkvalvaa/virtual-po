// @vitest-environment node
import { EventEmitter } from 'node:events';
import type { RequestOptions } from 'node:https';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lookup } from 'node:dns/promises';
import { postWebhook } from './webhook-http';

const network = vi.hoisted(() => ({ calls: [] as RequestOptions[], status: 200 }));
vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }));
vi.mock('node:https', () => ({ request: (options: RequestOptions, callback: (response: unknown) => void) => {
  network.calls.push(options);
  const req = new EventEmitter();
  return Object.assign(req, {
    end: () => queueMicrotask(() => {
      callback({ statusCode: network.status, headers: { location: 'http://127.0.0.1/private' }, destroy: () => req.emit('close') });
    }),
    destroy: (error: Error) => { req.emit('error', error); req.emit('close'); },
  });
} }));

describe('webhook connection boundary', () => {
  beforeEach(() => {
    network.calls = [];
    network.status = 200;
    vi.mocked(lookup).mockReset();
    vi.mocked(lookup).mockResolvedValue([{ address: '8.8.8.8', family: 4 }] as never);
  });

  it('pins the vetted IP while retaining the original Host and TLS server name', async () => {
    expect(await postWebhook('https://hooks.example:8443/events?key=test', '{}', {})).toBe(200);
    expect(network.calls).toHaveLength(1);
    expect(network.calls[0]).toMatchObject({ hostname: '8.8.8.8', servername: 'hooks.example',
      port: '8443', path: '/events?key=test', agent: false, headers: { Host: 'hooks.example:8443' } });
  });

  it('reports a redirect as a failure status without contacting its target', async () => {
    network.status = 302;
    expect(await postWebhook('https://hooks.example/events', '{}', {})).toBe(302);
    expect(network.calls).toHaveLength(1);
  });

  it('revalidates DNS on every delivery and prevents public-to-private rebinding', async () => {
    await postWebhook('https://hooks.example/events', '{}', {});
    vi.mocked(lookup).mockResolvedValue([{ address: '127.0.0.1', family: 4 }] as never);
    await expect(postWebhook('https://hooks.example/events', '{}', {})).rejects.toThrow();
    expect(network.calls).toHaveLength(1);
  });
});
