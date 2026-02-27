import { NextRequest, NextResponse } from 'next/server';

/**
 * Teams Bot Framework messaging endpoint.
 * Handles incoming messages from Teams bot interactions.
 *
 * Commands:
 *   /vpo submit <title> — Create a new feature request
 *   /vpo status [id]    — Check request status
 *   /vpo help            — Show available commands
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      type?: string;
      text?: string;
      from?: { id: string; name: string };
      channelData?: Record<string, unknown>;
      serviceUrl?: string;
      conversation?: { id: string };
    };

    // Handle Bot Framework conversation update (bot added to team)
    if (body.type === 'conversationUpdate') {
      return NextResponse.json({ status: 'ok' });
    }

    // Handle message activity
    if (body.type !== 'message') {
      return NextResponse.json({ status: 'ok' });
    }

    const text = (body.text ?? '').trim().toLowerCase();

    // Parse /vpo commands
    if (text.startsWith('/vpo') || text.startsWith('vpo')) {
      const command = text.replace(/^\/?vpo\s*/, '');

      if (command.startsWith('help') || command === '') {
        return NextResponse.json({
          type: 'message',
          text: [
            '**Virtual Product Owner — Teams Commands**',
            '',
            '`/vpo submit <title>` — Create a new feature request',
            '`/vpo status` — View recent requests',
            '`/vpo help` — Show this help message',
          ].join('\n'),
        });
      }

      if (command.startsWith('submit ')) {
        const title = command.replace('submit ', '').trim();
        if (!title) {
          return NextResponse.json({
            type: 'message',
            text: 'Please provide a title: `/vpo submit My feature idea`',
          });
        }

        // For now, return a confirmation with link to the web app
        return NextResponse.json({
          type: 'message',
          text: `Feature request noted: **${title}**\n\nPlease complete the intake process in the web app to proceed.`,
        });
      }

      if (command.startsWith('status')) {
        return NextResponse.json({
          type: 'message',
          text: 'View all requests and their status in the web app.',
        });
      }

      return NextResponse.json({
        type: 'message',
        text: `Unknown command: \`${command}\`. Try \`/vpo help\` for available commands.`,
      });
    }

    return NextResponse.json({ status: 'ok' });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
