import { NextRequest, NextResponse } from 'next/server';
import { verifySlackRequest } from '@/lib/slack/verify';
import { resolveSlackUser } from '@/lib/slack/resolve-user';
import { getFeatureRequestById } from '@/lib/db/queries/feature-requests';
import { canAccess } from '@/lib/auth/rbac';
import { applyDecision } from '@/lib/decisions/apply';
import type { DecisionType } from '@/lib/types/database';

interface SlackActor {
  id: string;
  username?: string;
  name?: string;
}

interface SlackBlockAction {
  action_id?: string;
  value?: string;
}

interface SlackInteractionPayload {
  type?: string;
  user?: SlackActor;
  actions?: SlackBlockAction[];
}

/** Buttons built by `buildApprovalCard`, which puts the request id in `value`. */
const ACTION_DECISIONS: Record<string, DecisionType> = {
  approve_request: 'APPROVE',
  reject_request: 'REJECT',
};

/** Only the clicking user sees this; the original message is left untouched. */
function ephemeral(text: string): NextResponse {
  return NextResponse.json({
    response_type: 'ephemeral',
    replace_original: false,
    text,
  });
}

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

  let payload: SlackInteractionPayload;
  try {
    payload = JSON.parse(payloadStr) as SlackInteractionPayload;
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  if (payload.type === 'block_actions' && payload.user) {
    for (const action of payload.actions ?? []) {
      const decision = action.action_id
        ? ACTION_DECISIONS[action.action_id]
        : undefined;
      if (decision) {
        return handleDecisionAction(action.value, decision, payload.user);
      }
    }
  }

  return NextResponse.json({ ok: true });
}

async function handleDecisionAction(
  requestId: string | undefined,
  decision: DecisionType,
  actor: SlackActor,
): Promise<NextResponse> {
  if (!requestId) {
    return ephemeral(':warning: This button is missing a request id.');
  }

  const request = await getFeatureRequestById(requestId).catch(() => null);
  if (!request) {
    return ephemeral(':warning: That feature request no longer exists.');
  }

  // The bot token lives on the org that owns the request, which is also the
  // only org whose members may act on it.
  const resolution = await resolveSlackUser(request.organizationId, actor.id);
  if (!resolution.ok) {
    if (resolution.reason === 'no_integration') {
      return ephemeral(':warning: Slack is not connected for this workspace.');
    }
    if (resolution.reason === 'profile_lookup_failed') {
      return ephemeral(':warning: Could not read your Slack profile.');
    }
    return ephemeral(
      ':no_entry: No VPO account matches your Slack email. Ask an admin to invite you.',
    );
  }

  const { user, role } = resolution;
  if (!role || !canAccess(role, 'REVIEWER')) {
    return ephemeral(':no_entry: You need the REVIEWER role to decide on requests.');
  }

  const label = decision === 'APPROVE' ? 'Approved' : 'Rejected';
  try {
    await applyDecision({
      requestId,
      organizationId: request.organizationId,
      userId: user.id,
      decision,
      rationale: `${label} from Slack by @${actor.username ?? actor.name ?? actor.id}`,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown error';
    return ephemeral(`:warning: Could not record the decision: ${reason}`);
  }

  return NextResponse.json({
    replace_original: true,
    text:
      decision === 'APPROVE'
        ? `:white_check_mark: Request approved by <@${actor.id}>`
        : `:x: Request rejected by <@${actor.id}>`,
  });
}
