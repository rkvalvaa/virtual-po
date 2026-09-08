# Webhook delivery operations

Apply migrations through `0039_webhook-outbox` before deploying the application. Domain changes and their matching webhook events commit together. The database triggers cover requests, assessments, security reviews, decisions, epics, and stories from both the UI/agents and the public API. Existing data is not replayed.

## Run the worker

The authenticated `GET /api/cron/webhooks` endpoint processes up to 20 due deliveries per invocation. Set `CRON_SECRET` on the application and scheduler. Configure a trusted scheduler to call it every minute with `Authorization: Bearer <CRON_SECRET>`, or run the supplied worker on an always-on host:

```sh
WEBHOOK_WORKER_URL=https://your-app.example CRON_SECRET=... npm run webhooks:worker
```

Inject credentials through the host's secret manager; do not paste real secrets into shared shell history. The worker calls the application over HTTPS, refuses redirects, waits for each batch, and repeats after 60 seconds. `npm run webhooks:worker -- --once` runs one sweep and returns a failing exit code if the endpoint fails. It does not load local `.env` files.

`vercel.json` includes a daily fallback sweep at 07:00 UTC. **This fallback alone does not provide prompt delivery.** For production, configure the minute scheduler or always-on worker above. On a Vercel plan supporting frequent cron jobs, change this job's schedule to `* * * * *`. Check [Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing) for the deployment plan before changing its cadence.

Monitor scheduler failures and the age of pending deliveries. Settings → Webhooks → Deliveries shows the latest 30 deliveries, attempt outcomes, HTTP status, and retry eligibility. An eligible delivery remains pending until a worker runs; it also waits while its subscription is paused. Do not treat an empty successful sweep as evidence that all paused deliveries were sent.

## Retry and receiver contract

Delivery is at least once. Receivers must deduplicate `X-Webhook-Id` (the stable event UUID); the JSON body and event ID remain unchanged across retries and manual redelivery. `X-Webhook-Delivery-Id` identifies delivery to a specific subscription. Verify the lowercase hex HMAC-SHA256 in `X-Webhook-Signature` against the exact raw request body and your signing secret, using a timing-safe comparison.

HTTP 2xx succeeds. Network failures, HTTP 408/429, and HTTP 5xx retry, with eligibility delays of 1, 2, 4, and 8 minutes, up to five total attempts. Other HTTP failures and rejected destinations stop immediately. The worker revalidates destinations, pins approved DNS results, refuses redirects, and applies timeouts on every attempt. Expired worker leases are recovered; an interrupted attempt counts toward the limit. A crash after the receiver accepts but before recording success can cause a duplicate.

Admins can retry failed deliveries in Settings; this starts a new retry cycle while retaining prior attempt history. Test sends an explicit `webhook.test` only to the selected subscription, including a paused subscription, regardless of its event filters. Test success requires an actual HTTP 2xx response.

## Signing secrets

Creating a webhook or rotating its secret returns the new secret once to the admin. Settings holds it only in component memory until dismissed; it is absent from history and initial page props. The server must retain the secret to sign requests. Do not log request signatures, secrets, or delivery payloads.

For rotation, pause the subscription, allow in-flight requests to finish, rotate and save the displayed secret, update the receiver, then resume. New attempts use the current secret, including retries of older events. Already in-flight requests may use the old secret. Use Test to confirm the receiver and retry failed deliveries if needed. Rotation is immediate, with no overlap period. Lost secrets cannot be retrieved from Settings; rotate again.

Delivery records currently remain until their subscription or organization is deleted. Plan database retention according to your organization's policy; deleting delivery records removes the associated retry and audit history. No automated retention job is installed.
