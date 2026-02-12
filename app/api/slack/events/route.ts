import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const body = await req.text();
  const parsed = JSON.parse(body);

  // Handle URL verification challenge
  if (parsed.type === 'url_verification') {
    return NextResponse.json({ challenge: parsed.challenge });
  }

  // For event callbacks, verify signature if we have it
  const timestamp = req.headers.get('x-slack-request-timestamp') ?? '';
  const signature = req.headers.get('x-slack-signature') ?? '';

  // TODO: Look up org's signing secret and verify
  // For now, process the event

  if (parsed.type === 'event_callback') {
    const event = parsed.event;

    if (event.type === 'app_mention' || (event.type === 'message' && event.channel_type === 'im')) {
      // Bot was mentioned or DM received - could submit a request
      const text = (event.text as string).replace(/<@[^>]+>/g, '').trim();

      if (text.length > 0) {
        // Try to find the org by Slack team_id
        // For now, return acknowledgment
        return NextResponse.json({ ok: true, message: 'Event received' });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
