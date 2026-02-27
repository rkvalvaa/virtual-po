import type { FeatureRequest } from '@/lib/types/database';

export interface TeamsWebhookConfig {
  webhookUrl: string;
}

/**
 * Post a message to a Teams channel via Incoming Webhook.
 * Accepts plain text or an Adaptive Card payload.
 */
export async function postToTeamsWebhook(
  webhookUrl: string,
  card: Record<string, unknown>
): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(card),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Teams webhook error ${response.status}: ${body}`);
  }
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
