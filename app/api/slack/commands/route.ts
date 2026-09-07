import { NextRequest, NextResponse } from 'next/server';
import { verifySlackRequest } from '@/lib/slack/verify';
import { getIntegrationBySlackTeamId } from '@/lib/db/queries/jira-sync';
import { resolveSlackUser } from '@/lib/slack/resolve-user';
import {
  createFeatureRequest,
  getFeatureRequestById,
  listFeatureRequests,
} from '@/lib/db/queries/feature-requests';
import { logActivity } from '@/lib/db/queries/activity-log';

const HELP_TEXT = [
  '*Virtual Product Owner Commands:*',
  '• `/vpo submit <title>` — Submit a new feature request',
  '• `/vpo list` — List your 5 most recent requests',
  '• `/vpo status <id>` — Check a request\'s status',
  '• `/vpo help` — Show this help message',
].join('\n');

const NOT_CONNECTED = ':warning: Slack is not connected for this workspace. Ask an admin to connect it in VPO settings.';
const NO_ACCOUNT = ':no_entry: No VPO account matches your Slack email. Ask an admin to invite you.';

/** Slash commands always reply ephemerally — visible only to the caller. */
function ephemeral(text: string): NextResponse {
  return NextResponse.json({ response_type: 'ephemeral', text });
}

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
  const teamId = formData.get('team_id') ?? '';
  const slackUserId = formData.get('user_id') ?? '';
  const text = (formData.get('text') ?? '').trim();

  const parts = text.split(/\s+/).filter(Boolean);
  const subcommand = (parts[0] ?? 'help').toLowerCase();
  const args = parts.slice(1).join(' ');

  if (!['submit', 'list', 'status'].includes(subcommand)) {
    return ephemeral(HELP_TEXT);
  }

  const integration = await getIntegrationBySlackTeamId(teamId);
  if (!integration) {
    return ephemeral(NOT_CONNECTED);
  }

  const orgId = integration.organizationId;
  const resolution = await resolveSlackUser(orgId, slackUserId);
  if (!resolution.ok) {
    if (resolution.reason === 'profile_lookup_failed') {
      return ephemeral(':warning: Could not read your Slack profile. Check the app has the `users:read.email` scope.');
    }
    return ephemeral(NO_ACCOUNT);
  }
  const { user } = resolution;

  if (subcommand === 'submit') {
    if (!args) {
      return ephemeral('Usage: `/vpo submit <title>`');
    }

    const request = await createFeatureRequest(orgId, user.id, args);
    // Non-critical — mirrors the in-app "new request" path, but a logging
    // failure shouldn't turn a successful submission into an error reply.
    logActivity({
      organizationId: orgId,
      requestId: request.id,
      userId: user.id,
      action: 'REQUEST_CREATED',
      entityType: 'REQUEST',
      entityId: request.id,
      metadata: { title: args, source: 'slack' },
    }).catch(() => {});

    const url = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/requests/${request.id}`;
    return ephemeral(`:white_check_mark: Created "${request.title}". Continue the intake here: ${url}`);
  }

  if (subcommand === 'list') {
    const { requests } = await listFeatureRequests(orgId, { requesterId: user.id, limit: 5 });
    if (requests.length === 0) {
      return ephemeral('You have no feature requests yet. Try `/vpo submit <title>`.');
    }
    const lines = requests.map((r) => `• ${r.title} — ${r.status}`);
    return ephemeral(['*Your recent requests:*', ...lines].join('\n'));
  }

  // subcommand === 'status'
  if (!args) {
    return ephemeral('Usage: `/vpo status <id>`');
  }
  const request = await getFeatureRequestById(args).catch(() => null);
  if (!request || request.organizationId !== orgId) {
    return ephemeral(`:warning: No request found with id \`${args}\`.`);
  }
  const url = `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/requests/${request.id}`;
  return ephemeral(`*${request.title}* — ${request.status}\n${url}`);
}
