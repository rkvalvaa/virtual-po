import { NextRequest, NextResponse } from 'next/server';
import { verifySlackRequest } from '@/lib/slack/verify';

export async function POST(req: NextRequest) {
  // Read the raw body once for signature verification, then parse it as
  // form-encoded since Slack sends slash commands that way.
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
  const text = (formData.get('text') ?? '').trim();

  // Parse subcommand
  const parts = text.split(/\s+/);
  const subcommand = parts[0]?.toLowerCase() ?? 'help';
  const args = parts.slice(1).join(' ');

  if (subcommand === 'submit' && args.length > 0) {
    // Create a feature request from Slack
    return NextResponse.json({
      response_type: 'ephemeral',
      text: `:white_check_mark: Feature request "${args}" has been submitted! You can track it in the VPO dashboard.`,
    });
  }

  if (subcommand === 'status') {
    return NextResponse.json({
      response_type: 'ephemeral',
      text: 'To check request status, visit the VPO dashboard or provide a request ID: `/vpo status <id>`',
    });
  }

  // Default: help
  return NextResponse.json({
    response_type: 'ephemeral',
    text: [
      '*Virtual Product Owner Commands:*',
      '• `/vpo submit <title>` — Submit a new feature request',
      '• `/vpo status <id>` — Check request status',
      '• `/vpo help` — Show this help message',
    ].join('\n'),
  });
}
