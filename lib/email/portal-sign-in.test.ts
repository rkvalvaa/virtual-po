// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hasDb } from '@/test/db-helpers';
import { query } from '@/lib/db/pool';

const mocks = vi.hoisted(() => ({ send: vi.fn(), later: [] as (() => Promise<unknown>)[], error: vi.fn() }));
vi.mock('resend', () => ({ Resend: vi.fn(function Resend() { return { emails: { send: mocks.send } }; }) }));
vi.mock('next/server', () => ({ after: (task: () => Promise<unknown>) => { mocks.later.push(task); } }));
vi.mock('@/lib/logging/logger', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: mocks.error } }));

import { sendPortalSignInLink } from './portal-sign-in';

const params = (identifier = 'kari@client.example', expires = new Date(Date.now() + 15 * 60_000)) => ({
  identifier, url: 'https://vpo.example/api/auth/callback/resend?token=abc', expires,
}) as Parameters<typeof sendPortalSignInLink>[0];

/** Run what the request deferred until after its response. */
const afterResponse = async () => { for (const task of mocks.later.splice(0)) await task(); };

describe('sendPortalSignInLink', () => {
  beforeEach(() => {
    Object.assign(process.env, { RESEND_API_KEY: 're_test', EMAIL_FROM: 'VPO <vpo@example.test>', APP_URL: 'https://vpo.example' });
    mocks.send.mockReset().mockResolvedValue({ data: { id: 'msg' }, error: null });
    mocks.error.mockReset();
    mocks.later.length = 0;
  });
  afterEach(() => { delete process.env.RESEND_API_KEY; delete process.env.EMAIL_FROM; delete process.env.APP_URL; });

  it('answers before contacting the provider, then emails the one-time link', async () => {
    await sendPortalSignInLink(params());
    expect(mocks.send).not.toHaveBeenCalled();

    await afterResponse();
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({
      from: 'VPO <vpo@example.test>', to: 'kari@client.example', text: expect.stringContaining(params().url),
    }));
    expect(mocks.send.mock.calls[0][0].text).toMatch(/15 minutes/);
  });

  it('never lets a rejected or broken send reach the requester', async () => {
    mocks.send.mockResolvedValueOnce({ data: null, error: { message: 'domain not verified' } });
    await expect(sendPortalSignInLink(params())).resolves.toBeUndefined();
    mocks.send.mockRejectedValueOnce(new Error('network down'));
    await expect(sendPortalSignInLink(params())).resolves.toBeUndefined();
    delete process.env.RESEND_API_KEY;
    await expect(sendPortalSignInLink(params())).resolves.toBeUndefined();

    await afterResponse();
    expect(mocks.error.mock.calls.map(([event]) => event)).toEqual(Array(3).fill('portal.sign_in_link.failed'));
    expect(JSON.stringify(mocks.error.mock.calls)).not.toContain('kari@client.example');
  });
});

describe.skipIf(!hasDb())('sendPortalSignInLink link allowance', () => {
  beforeEach(() => {
    Object.assign(process.env, { RESEND_API_KEY: 're_test', EMAIL_FROM: 'VPO <vpo@example.test>', APP_URL: 'https://vpo.example' });
    mocks.later.length = 0;
  });
  afterEach(() => { delete process.env.RESEND_API_KEY; delete process.env.EMAIL_FROM; delete process.env.APP_URL; });

  it('gives back the outstanding link when the send fails, and keeps it when the send works', async () => {
    const failed = params(`failed-${crypto.randomUUID()}@client.example`);
    const sent = params(`sent-${crypto.randomUUID()}@client.example`);
    for (const p of [failed, sent]) {
      await query('INSERT INTO verification_tokens (identifier, expires, token) VALUES ($1, $2, $3)', [p.identifier, p.expires, crypto.randomUUID()]);
    }
    try {
      mocks.send.mockReset().mockResolvedValueOnce({ data: null, error: { message: 'rejected' } }).mockResolvedValueOnce({ data: { id: 'msg' }, error: null });
      await sendPortalSignInLink(failed);
      await sendPortalSignInLink(sent);
      await afterResponse();

      const left = await query<{ identifier: string }>('SELECT identifier FROM verification_tokens WHERE identifier = ANY($1)', [[failed.identifier, sent.identifier]]);
      expect(left.rows.map(r => r.identifier)).toEqual([sent.identifier]);
    } finally {
      await query('DELETE FROM verification_tokens WHERE identifier = ANY($1)', [[failed.identifier, sent.identifier]]);
    }
  });
});
