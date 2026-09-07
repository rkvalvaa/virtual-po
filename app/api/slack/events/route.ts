import { NextRequest, NextResponse } from 'next/server';
import { verifySlackRequest } from '@/lib/slack/verify';

export async function POST(req: NextRequest) {
  const body = await req.text();

  // URL verification is exempt from signature checking because Slack sends
  // it during app setup before the signing secret is paired with this URL.
  // The challenge payload itself is the verification.
  let parsed: { type?: string; challenge?: string };
  try {
    parsed = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (parsed.type === 'url_verification') {
    return NextResponse.json({ challenge: parsed.challenge });
  }

  const verification = verifySlackRequest(
    body,
    req.headers,
    process.env.SLACK_SIGNING_SECRET,
  );
  if (!verification.ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // No event types are acted on yet — just acknowledge so Slack doesn't retry.
  return NextResponse.json({ ok: true });
}
