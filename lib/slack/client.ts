import crypto from 'crypto';
import type { FeatureRequest } from '@/lib/types/database';

export interface SlackClientConfig {
  botToken: string;
}

export function createSlackClient(config: SlackClientConfig) {
  const headers = {
    'Authorization': `Bearer ${config.botToken}`,
    'Content-Type': 'application/json',
  };

  async function api<T>(method: string, body?: Record<string, unknown>): Promise<T> {
    const response = await fetch(`https://slack.com/api/${method}`, {
      method: 'POST',
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json() as { ok: boolean; error?: string; [key: string]: unknown };
    if (!data.ok) {
      throw new Error(`Slack API error on ${method}: ${data.error ?? 'Unknown error'}`);
    }
    return data as T;
  }

  return {
    async postMessage(channel: string, text: string, blocks?: unknown[]): Promise<{ ts: string; channel: string }> {
      return api<{ ts: string; channel: string }>('chat.postMessage', { channel, text, blocks });
    },

    async updateMessage(channel: string, ts: string, text: string, blocks?: unknown[]): Promise<void> {
      await api('chat.update', { channel, ts, text, blocks });
    },

    async getChannels(): Promise<Array<{ id: string; name: string }>> {
      const result = await api<{ channels: Array<{ id: string; name: string }> }>('conversations.list', {
        types: 'public_channel',
        limit: 200,
        exclude_archived: true,
      });
      return result.channels;
    },

    async openModal(triggerId: string, view: unknown): Promise<void> {
      await api('views.open', { trigger_id: triggerId, view });
    },

    async addReaction(channel: string, timestamp: string, name: string): Promise<void> {
      await api('reactions.add', { channel, timestamp, name });
    },
  };
}

export function getSlackClientFromIntegration(
  integration: { config: Record<string, unknown> }
): ReturnType<typeof createSlackClient> {
  const { botToken } = integration.config;
  if (typeof botToken !== 'string') {
    throw new Error('Invalid Slack integration config: missing botToken');
  }
  return createSlackClient({ botToken });
}

// Build Slack Block Kit message for a feature request
export function buildRequestCard(
  request: Pick<FeatureRequest, 'id' | 'title' | 'status' | 'priorityScore' | 'complexity'>,
  baseUrl: string
) {
  const statusEmoji: Record<string, string> = {
    DRAFT: ':pencil2:',
    INTAKE_IN_PROGRESS: ':speech_balloon:',
    PENDING_ASSESSMENT: ':hourglass:',
    UNDER_REVIEW: ':eyes:',
    APPROVED: ':white_check_mark:',
    REJECTED: ':x:',
    DEFERRED: ':clock3:',
    IN_BACKLOG: ':inbox_tray:',
    IN_PROGRESS: ':hammer_and_wrench:',
    COMPLETED: ':tada:',
  };

  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*<${baseUrl}/requests/${request.id}|${request.title}>*`,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Status:* ${statusEmoji[request.status] ?? ''} ${request.status.replace(/_/g, ' ')}` },
        { type: 'mrkdwn', text: `*Priority:* ${request.priorityScore != null ? `${request.priorityScore}/100` : 'Unscored'}` },
        { type: 'mrkdwn', text: `*Complexity:* ${request.complexity ?? 'Unknown'}` },
      ],
    },
  ];
}

// Build approval card with approve/reject buttons
export function buildApprovalCard(
  request: Pick<FeatureRequest, 'id' | 'title' | 'status' | 'priorityScore' | 'complexity'>,
  baseUrl: string
) {
  return [
    ...buildRequestCard(request, baseUrl),
    { type: 'divider' },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Approve' },
          style: 'primary',
          action_id: 'approve_request',
          value: request.id,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Reject' },
          style: 'danger',
          action_id: 'reject_request',
          value: request.id,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'View Details' },
          url: `${baseUrl}/requests/${request.id}`,
          action_id: 'view_request',
        },
      ],
    },
  ];
}

// Verify Slack request signature
export function verifySlackSignature(
  signingSecret: string,
  timestamp: string,
  body: string,
  signature: string
): boolean {
  const sigBase = `v0:${timestamp}:${body}`;
  const hmac = crypto.createHmac('sha256', signingSecret).update(sigBase).digest('hex');
  const computed = `v0=${hmac}`;
  try {
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature));
  } catch {
    return false;
  }
}
