# AI request limits

All four agent endpoints share the policy in `lib/agents/limits.ts`.

| Boundary | Limit |
| --- | --- |
| Incoming JSON body | 128 KiB, counted while reading, without trusting Content-Length |
| Incoming message array | 100 messages; client normally sends only the newest user message |
| User text | At most 8 text parts, each at most 16,000 characters |
| Model context | 160 KiB of serialized context, checked before each model step |
| Conversation window | At most 40 recent messages, starting at a user message; full saved history is retained |
| Model output | 4,096 tokens per step, at most 5 steps |
| Run duration | 120-second model timeout; abandoned concurrency leases expire after 3 minutes |
| User admissions | 60 per rolling hour, across organizations |
| Organization admissions | 300 per rolling hour |
| Concurrency | One active run per request; three per organization |

PostgreSQL transaction advisory locks serialize admissions by user and organization across application instances. The `agent_runs` table is the shared ledger. Admitted attempts count toward the hourly limits even when generation fails. Validation failures rejected before admission do not count. Completed, failed, and expired runs do not hold concurrency slots. Consumer cancellation and request cleanup release active leases.

Malformed requests return 400, oversized bodies/context return 413, and quota denials return 429 with `Retry-After`. A context budget exceeded after streaming has begun is reported through the stream and leaves the run failed. Chat displays the error and retains a retry path. Hourly denials advise waiting one hour; busy-organization denials advise retrying after 30 seconds.

Older conversation turns are omitted from model input when the window fills; they remain available in the saved conversation. Persisted intake and assessment context is supplied separately. A single request context that cannot fit is rejected with guidance to shorten its details.
