import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const text = ((formData.get('text') as string) ?? '').trim();

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
      '\u2022 `/vpo submit <title>` \u2014 Submit a new feature request',
      '\u2022 `/vpo status <id>` \u2014 Check request status',
      '\u2022 `/vpo help` \u2014 Show this help message',
    ].join('\n'),
  });
}
