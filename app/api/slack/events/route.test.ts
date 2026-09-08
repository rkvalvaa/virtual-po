// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { POST } from './route';

describe('Slack URL verification authentication', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('rejects unsigned URL verification rather than echoing an anonymous challenge', async () => {
    vi.stubEnv('SLACK_SIGNING_SECRET', 'local-test-secret');
    const res = await POST(new NextRequest('http://localhost/api/slack/events', {
      method: 'POST', body: JSON.stringify({ type: 'url_verification', challenge: 'challenge' }),
    }));
    expect(res.status).toBe(401);
  });
  it('accepts a properly signed URL verification', async () => {
    vi.stubEnv('SLACK_SIGNING_SECRET', 'local-test-secret');
    const body = JSON.stringify({ type: 'url_verification', challenge: 'challenge' });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = 'v0=' + crypto.createHmac('sha256', 'local-test-secret').update(`v0:${timestamp}:${body}`).digest('hex');
    const res = await POST(new NextRequest('http://localhost/api/slack/events', {
      method: 'POST', body, headers: { 'X-Slack-Signature': signature, 'X-Slack-Request-Timestamp': timestamp },
    }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ challenge: 'challenge' });
  });
});
