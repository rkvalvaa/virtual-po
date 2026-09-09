// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendInvitationEmail } from './invitation';
const send = vi.hoisted(() => vi.fn());
vi.mock('resend', () => ({ Resend: class { emails = { send }; } }));
const invite = { id: 'id', token: 'a'.repeat(64), email: 'person@example.test', organizationName: '<Workspace>', role: 'REVIEWER' as const };
describe('invitation delivery', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
  it('reports missing configuration instead of pretending to send', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    expect(await sendInvitationEmail(invite)).toMatchObject({ success: false });
    expect(send).not.toHaveBeenCalled();
  });
  it('uses the configured app origin and treats provider error responses as failures', async () => {
    vi.stubEnv('RESEND_API_KEY', 'test'); vi.stubEnv('EMAIL_FROM', 'vpo@example.test'); vi.stubEnv('AUTH_URL', 'https://vpo.example.test');
    send.mockResolvedValueOnce({ data: null, error: { message: 'Rejected' } });
    expect(await sendInvitationEmail(invite)).toMatchObject({ success: false });
    send.mockResolvedValueOnce({ data: { id: 'sent' }, error: null });
    expect(await sendInvitationEmail(invite)).toEqual({ success: true });
    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ to: invite.email, text: expect.stringContaining(`https://vpo.example.test/invite/${invite.token}`) }));
    expect(send.mock.calls[1][0].html).toBeUndefined();
  });
});
