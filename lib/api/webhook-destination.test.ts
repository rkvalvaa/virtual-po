// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lookup } from 'node:dns/promises';
import { validateWebhookDestination } from './webhook-destination';

vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }));

describe('webhook destination policy', () => {
  beforeEach(() => { vi.mocked(lookup).mockReset(); });

  it.each([
    'http://127.0.0.1/', 'http://127.1/', 'http://2130706433/', 'http://0x7f000001/',
    'http://10.1.2.3/', 'http://172.16.0.1/', 'http://192.168.1.1/',
    'http://169.254.169.254/', 'http://100.64.0.1/', 'http://0.0.0.0/',
    'http://224.0.0.1/', 'http://198.18.0.1/', 'http://192.0.2.1/',
    'http://[::1]/', 'http://[::ffff:127.0.0.1]/', 'http://[::ffff:8.8.8.8]/',
    'http://[fe80::1]/', 'http://[fc00::1]/', 'http://[2001:db8::1]/',
    'http://[2002:7f00:1::]/', 'http://[3fff::1]/', 'http://[64:ff9b::7f00:1]/',
    'file:///etc/passwd', 'ftp://example.test/', 'https://user:password@example.test/',
    'https://example.test/#fragment', 'not a url',
  ])('rejects unsafe destination %s', async (url) => {
    await expect(validateWebhookDestination(url)).rejects.toThrow();
  });

  it('accepts ordinary public IPv4 and IPv6 addresses', async () => {
    expect((await validateWebhookDestination('https://8.8.8.8/hook')).address).toBe('8.8.8.8');
    expect((await validateWebhookDestination('https://[2606:4700:4700::1111]/hook')).address).toBe('2606:4700:4700::1111');
  });

  it('rejects a hostname resolving to any private address', async () => {
    vi.mocked(lookup).mockResolvedValue([
      { address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 },
    ] as never);
    await expect(validateWebhookDestination('https://mixed.example/hook')).rejects.toThrow();
  });

  it('returns a vetted public connection address and preserves the original hostname', async () => {
    vi.mocked(lookup).mockResolvedValue([{ address: '8.8.8.8', family: 4 }] as never);
    const result = await validateWebhookDestination('https://hooks.example:8443/events');
    expect(result.address).toBe('8.8.8.8');
    expect(result.url.hostname).toBe('hooks.example');
    expect(result.url.port).toBe('8443');
  });

  it('fails closed when DNS fails or has no records', async () => {
    vi.mocked(lookup).mockRejectedValueOnce(new Error('DNS failure'));
    await expect(validateWebhookDestination('https://missing.example')).rejects.toThrow();
    vi.mocked(lookup).mockResolvedValueOnce([] as never);
    await expect(validateWebhookDestination('https://missing.example')).rejects.toThrow();
  });
});
