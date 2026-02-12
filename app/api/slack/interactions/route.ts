import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const payloadStr = formData.get('payload') as string;

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
