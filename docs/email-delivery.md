# Email delivery operations

Notification emails use a PostgreSQL outbox. Creating an in-app notification and its email delivery row happens in one transaction, so a serverless request can return without depending on background promises. The authenticated `GET /api/cron/email` endpoint leases and processes up to 20 due rows. `vercel.json` calls it every minute. An always-on host can run the same supported path with:

```sh
EMAIL_WORKER_URL=https://your-app.example CRON_SECRET=... npm run email:worker
```

`npm run email:worker -- --once` performs one sweep. The worker requires HTTPS outside localhost, refuses redirects, and never prints credentials.

Configure `RESEND_API_KEY`, an explicitly verified `EMAIL_FROM`, and the canonical `APP_URL`. Validated `AUTH_URL` or `NEXT_PUBLIC_APP_URL` values remain compatibility fallbacks, with `APP_URL` taking priority. The settings page reports configuration metadata without returning the API key. Its admin test is sent only to the signed-in administrator's database address. Provider acceptance verifies that Resend accepted the API request and sender; it does not prove inbox delivery.

Each outbox row and retry generation has a stable `email-delivery/<delivery UUID>/<generation>` provider idempotency key. [Resend documents a 24-hour lifetime](https://resend.com/docs/dashboard/emails/idempotency-keys) for these keys, so the first provider request stores that deadline and freezes the exact sender, recipient, subject, HTML, and text before network I/O. Automatic retries reuse that frozen request and stop after five attempts or when the 24-hour window closes. A worker interruption before provider I/O remains queued without consuming a provider attempt. An interruption or thrown error after provider I/O has started is an unknown outcome; it can retry only inside the same safe window and otherwise requires reconciliation.

Returned permanent errors stop immediately. A current workspace administrator can start one bounded manual retry generation for a confirmed failure or previously unavailable row. Manual retry is unavailable for unknown outcomes and recipients who no longer qualify.

Immediately before every provider request, the worker rechecks the stored recipient address, current workspace membership, notification preference, request tenancy, and administrator role for test messages. Failed checks prevent provider I/O and remain visible as an ineligible recipient.

The visible states mean:

- `Unavailable`: required delivery configuration was absent when queued or processed.
- `Queued`: persisted and awaiting a worker attempt.
- `Processing`: held by a time-limited worker lease.
- `Accepted by provider`: Resend returned a provider message ID. Inbox delivery is unconfirmed.
- `Delivered to recipient mail server`: a signed `email.delivered` webhook matched the provider message ID. Resend defines this as acceptance by the recipient's mail server; it does not prove inbox placement.
- `Failed`: retry limit reached or the provider returned a permanent failure. The final safe error is retained.
- `Reconciliation required`: the provider may have accepted the email, but no definitive response was stored before the 24-hour idempotency window closed. Automatic and manual sending remain blocked.

Configure a Resend webhook to post delivery events to `/api/webhooks/resend`, and set its signing secret as `RESEND_WEBHOOK_SECRET`. The endpoint verifies the raw payload and Svix headers before writing an idempotent provider-event inbox keyed by `svix-id`, matching [Resend's at-least-once and unordered webhook contract](https://resend.com/docs/webhooks/introduction). Every frozen provider payload includes the local delivery UUID as a Resend tag. Events are retained even when they arrive before the API response stores its provider message ID, then reconciled through that signed delivery reference and by provider message ID and event time. `email.failed`, `email.bounced`, and `email.suppressed` become visible failures.

Routine tests mock all provider effects. No live email was sent while implementing this feature, and production sender verification/webhook delivery still requires deployment-specific validation.
