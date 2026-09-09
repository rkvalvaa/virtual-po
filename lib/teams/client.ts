import type { FeatureRequest } from '@/lib/types/database';

export interface TeamsWebhookConfig {
  webhookUrl: string;
}

export function isTeamsWebhookUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && (url.hostname.endsWith('.webhook.office.com') || url.hostname.endsWith('.logic.azure.com'))
  } catch { return false }
}

export type TeamsPostResult = { accepted: true; httpStatus: number } | { accepted: false; httpStatus: number; retryable: boolean; ambiguous: boolean; message: string }

export async function sendTeamsWebhook(webhookUrl: string, card: Record<string, unknown>): Promise<TeamsPostResult> {
  if (!isTeamsWebhookUrl(webhookUrl)) return { accepted: false, httpStatus: 0, retryable: false, ambiguous: false, message: 'The Teams webhook URL is invalid.' }
  const response = await fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(card), redirect: 'error', signal: AbortSignal.timeout(10_000) })
  if (response.ok) return { accepted: true, httpStatus: response.status }
  return { accepted: false, httpStatus: response.status, retryable: response.status === 429, ambiguous: response.status === 408 || response.status >= 500, message: `Teams returned HTTP ${response.status}.` }
}

/**
 * Post a message to a Teams channel via Incoming Webhook.
 * Accepts plain text or an Adaptive Card payload.
 */
export async function postToTeamsWebhook(
  webhookUrl: string,
  card: Record<string, unknown>
): Promise<void> {
  const response = await sendTeamsWebhook(webhookUrl, card);
  if (!response.accepted) throw new Error(response.message);
}

/**
 * Build an Adaptive Card for a feature request notification.
 */
export function buildRequestCard(
  request: Pick<FeatureRequest, 'id' | 'title' | 'status' | 'priorityScore' | 'complexity'>,
  baseUrl: string
): Record<string, unknown> {
  const statusEmoji: Record<string, string> = {
    DRAFT: '📝',
    INTAKE_IN_PROGRESS: '💬',
    PENDING_ASSESSMENT: '⏳',
    UNDER_REVIEW: '👀',
    APPROVED: '✅',
    REJECTED: '❌',
    DEFERRED: '🕐',
    IN_BACKLOG: '📥',
    IN_PROGRESS: '🔨',
    COMPLETED: '🎉',
  };

  return {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          '$schema': 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.4',
          body: [
            {
              type: 'TextBlock',
              text: request.title,
              weight: 'Bolder',
              size: 'Medium',
              wrap: true,
            },
            {
              type: 'FactSet',
              facts: [
                {
                  title: 'Status',
                  value: `${statusEmoji[request.status] ?? ''} ${request.status.replace(/_/g, ' ')}`,
                },
                {
                  title: 'Priority',
                  value: request.priorityScore != null ? `${request.priorityScore}/100` : 'Unscored',
                },
                {
                  title: 'Complexity',
                  value: request.complexity ?? 'Unknown',
                },
              ],
            },
          ],
          actions: [
            {
              type: 'Action.OpenUrl',
              title: 'View Details',
              url: `${baseUrl}/requests/${request.id}`,
            },
          ],
        },
      },
    ],
  };
}

/**
 * Build an Adaptive Card with approve/reject actions.
 */
export function buildApprovalCard(
  request: Pick<FeatureRequest, 'id' | 'title' | 'status' | 'priorityScore' | 'complexity'>,
  baseUrl: string
): Record<string, unknown> {
  const card = buildRequestCard(request, baseUrl);
  const attachments = card.attachments as Array<{ content: Record<string, unknown> }>;
  const content = attachments[0].content;

  content.actions = [
    {
      type: 'Action.OpenUrl',
      title: 'Approve',
      url: `${baseUrl}/requests/${request.id}?action=approve`,
      style: 'positive',
    },
    {
      type: 'Action.OpenUrl',
      title: 'Reject',
      url: `${baseUrl}/requests/${request.id}?action=reject`,
      style: 'destructive',
    },
    {
      type: 'Action.OpenUrl',
      title: 'View Details',
      url: `${baseUrl}/requests/${request.id}`,
    },
  ];

  return card;
}

/**
 * Send a simple text message to a Teams channel via Incoming Webhook.
 */
export async function postTextToTeams(
  webhookUrl: string,
  text: string
): Promise<void> {
  const payload = {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: {
          '$schema': 'http://adaptivecards.io/schemas/adaptive-card.json',
          type: 'AdaptiveCard',
          version: '1.4',
          body: [
            {
              type: 'TextBlock',
              text,
              wrap: true,
            },
          ],
        },
      },
    ],
  };

  await postToTeamsWebhook(webhookUrl, payload);
}

export interface TeamsReplyActivity {
  id: string
  serviceUrl: string
  conversation: { id: string }
  from: { id: string }
  recipient?: { id: string }
}

export async function sendTeamsReply(activity: TeamsReplyActivity, text: string): Promise<void> {
  const appId = process.env.TEAMS_BOT_APP_ID
  const secret = process.env.TEAMS_BOT_APP_SECRET
  if (!appId || !secret) throw new Error('Teams bot credentials are unavailable.')
  const tokenResponse = await fetch('https://login.microsoftonline.com/botframework.com/oauth2/v2.0/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: appId, client_secret: secret, scope: 'https://api.botframework.com/.default' }), signal: AbortSignal.timeout(10_000),
  })
  if (!tokenResponse.ok) throw new Error('Teams bot authentication failed.')
  const token = await tokenResponse.json() as { access_token?: string }
  if (!token.access_token) throw new Error('Teams bot authentication returned no access token.')
  const url = `${activity.serviceUrl.replace(/\/$/, '')}/v3/conversations/${encodeURIComponent(activity.conversation.id)}/activities/${encodeURIComponent(activity.id)}`
  const response = await fetch(url, {
    method: 'POST', headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'message', from: activity.recipient, recipient: activity.from, conversation: activity.conversation, replyToId: activity.id, text }),
    redirect: 'error', signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error(`Teams reply failed with HTTP ${response.status}.`)
}
