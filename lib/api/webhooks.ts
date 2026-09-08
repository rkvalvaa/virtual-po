import crypto from 'node:crypto';
import { getWebhooksByEvent, incrementWebhookFailure, resetWebhookFailure, updateWebhookSubscription } from '@/lib/db/queries/webhooks';
import type { WebhookEvent, WebhookSubscription } from '@/lib/types/database';
import { postWebhook } from './webhook-http';

const MAX_FAILURE_COUNT = 10;

function signPayload(body: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

async function sendWebhook(
  subscription: WebhookSubscription,
  body: string
): Promise<void> {
  const signature = signPayload(body, subscription.secret);

  try {
    const status = await postWebhook(subscription.url, body, {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'User-Agent': 'VirtualPO-Webhook/1.0',
    });

    if (status >= 200 && status < 300) {
      await resetWebhookFailure(subscription.id);
    } else {
      await incrementWebhookFailure(subscription.id);
      if (subscription.failureCount + 1 >= MAX_FAILURE_COUNT) {
        await updateWebhookSubscription(subscription.id, { isActive: false });
      }
    }
  } catch {
    await incrementWebhookFailure(subscription.id);
    if (subscription.failureCount + 1 >= MAX_FAILURE_COUNT) {
      await updateWebhookSubscription(subscription.id, { isActive: false });
    }
  }
}

export function dispatchWebhookEvent(
  orgId: string,
  event: WebhookEvent,
  payload: Record<string, unknown>
): void {
  // Fire-and-forget: don't block the caller
  getWebhooksByEvent(orgId, event)
    .then((subscriptions) => {
      if (subscriptions.length === 0) return;

      const body = JSON.stringify({
        id: crypto.randomUUID(),
        event,
        payload,
        timestamp: new Date().toISOString(),
      });

      const promises = subscriptions.map((sub) => sendWebhook(sub, body));
      Promise.allSettled(promises);
    })
    .catch(() => {
      // Silently ignore lookup failures for fire-and-forget
    });
}
