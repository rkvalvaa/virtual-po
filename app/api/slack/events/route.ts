import { NextRequest, NextResponse } from 'next/server';
import { verifySlackRequest } from '@/lib/slack/verify';

export async function POST(req: NextRequest) {
  const body = await req.text();

  // URL verification is exempt from signature checking because Slack sends
  // it during app setup before the signing secret is paired with this URL.
  // The challenge payload itself is the verification.
  let parsed: { type?: string; challenge?: string; event?: { type?: string; text?: string; channel_type?: string } };
  try {
    parsed = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (parsed.type === 'url_verification') {
    return NextResponse.json({ challenge: parsed.challenge });
  }

  // Verify the request actually came from Slack. Falls back to the env-var
  // signing secret for single-tenant deployments; multi-tenant lookup via
  // team_id would require storing it alongside other Slack config (follow-up).
  const verification = verifySlackRequest(
    body,
    req.headers,
    process.env.SLACK_SIGNING_SECRET,
  );
  if (!verification.ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (parsed.type === 'event_callback' && parsed.event) {
    const event = parsed.event;

    if (event.type === 'app_mention' || (event.type === 'message' && event.channel_type === 'im')) {
      // Bot was mentioned or DM received - could submit a request.
      const text = (event.text ?? '').replace(/<@[^>]+>/g, '').trim();

      if (text.length > 0) {
        // Try to find the org by Slack team_id.
        // For now, return acknowledgment.
        return NextResponse.json({ ok: true, message: 'Event received' });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
