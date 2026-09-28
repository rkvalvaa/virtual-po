import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const send = vi.hoisted(() => vi.fn());
vi.mock('resend', () => ({ Resend: vi.fn(function Resend() { return { emails: { send } }; }) }));

import { sendPortalSignInLink } from './portal-sign-in';

const params = {
  identifier: 'kari@client.example',
  url: 'https://vpo.example/api/auth/callback/resend?token=abc',
  expires: new Date(),
} as Parameters<typeof sendPortalSignInLink>[0];

describe('sendPortalSignInLink', () => {
  beforeEach(() => {
    Object.assign(process.env, { RESEND_API_KEY: 're_test', EMAIL_FROM: 'VPO <vpo@example.test>', APP_URL: 'https://vpo.example' });
    send.mockReset().mockResolvedValue({ data: { id: 'msg' }, error: null });
  });
  afterEach(() => { delete process.env.RESEND_API_KEY; delete process.env.EMAIL_FROM; delete process.env.APP_URL; });

  it('emails the one-time link with its lifetime', async () => {
    await sendPortalSignInLink(params);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      from: 'VPO <vpo@example.test>',
      to: 'kari@client.example',
      text: expect.stringContaining(params.url),
    }));
    expect(send.mock.calls[0][0].text).toMatch(/15 minutes/);
  });

  it('fails loudly when the provider rejects the email', async () => {
    send.mockResolvedValue({ data: null, error: { message: 'domain not verified' } });
    await expect(sendPortalSignInLink(params)).rejects.toThrow(/sign-in link/i);
  });

  it('fails loudly when email is not configured', async () => {
    delete process.env.RESEND_API_KEY;
    await expect(sendPortalSignInLink(params)).rejects.toThrow(/RESEND_API_KEY/);
    expect(send).not.toHaveBeenCalled();
  });
});
