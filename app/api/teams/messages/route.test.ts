// @vitest-environment node
import { expect, it } from 'vitest';
import { POST } from './route';
import { NextRequest } from 'next/server';

it.each([
  { type: 'message', text: '/vpo submit Preserve My Title', from: { id: 'unknown' }, channelData: { tenant: { id: 'unknown' } } },
  { type: 'message', text: '/vpo status' },
  { type: 'conversationUpdate' },
])('never acknowledges unsupported Teams activities as successful', async body => {
  const request = new NextRequest('https://example.com/api/teams/messages', {
    method: 'POST', headers: { authorization: 'Bearer invalid-token', 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const response = await POST(request);
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: 'Teams bot commands are unavailable. Submit and track requests in the VPO web app.', code: 'TEAMS_COMMANDS_UNAVAILABLE' });
  expect(request.bodyUsed).toBe(false);
});
