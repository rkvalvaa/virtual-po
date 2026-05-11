import { NextRequest, NextResponse } from 'next/server';
import { verifySlackRequest } from '@/lib/slack/verify';

export async function POST(req: NextRequest) {
  // Slack sends interaction payloads as form-encoded bodies whose `payload`
  // field is a JSON string. We must verify the signature against the raw
  // body bytes, NOT against re-stringified form data.
  const rawBody = await req.text();

  const verification = verifySlackRequest(
    rawBody,
    req.headers,
    process.env.SLACK_SIGNING_SECRET,
  );
  if (!verification.ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = new URLSearchParams(rawBody);
  const payloadStr = formData.get('payload');

  if (!payloadStr) {
    return NextResponse.json({ error: 'No payload' }, { status: 400 });
  }

  const payload = JSON.parse(payloadStr);

  if (payload.type === 'block_actions') {
    for (const action of payload.actions) {
      if (action.action_id === 'approve_request') {
        // TODO: Create approval decision, update status
        return NextResponse.json({
          replace_original: true,
          text: `:white_check_mark: Request approved by <@${payload.user.id}>`,
        });
      }

      if (action.action_id === 'reject_request') {
        // TODO: Create rejection decision, update status
        return NextResponse.json({
          replace_original: true,
          text: `:x: Request rejected by <@${payload.user.id}>`,
        });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
