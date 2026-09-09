# CCT-2058 remaining workflows: delivery evidence

Implementation date: 2026-09-09. Covers CCT-2063 and CCT-2068 through CCT-2077.

## Implemented scope

| Issue | Behavior | Primary verification |
| --- | --- | --- |
| 2063 | Remembered, membership-validated workspace switching; role refresh and cross-tab cache isolation | Auth/database regressions and desktop/mobile/cross-tab browser flows |
| 2068 | Tenant/provider/destination/entity import identity, preview and pagination, lifecycle-aware conflict policy | Provider contract, action, database concurrency and UI tests |
| 2069 | Durable email outbox, safe rendering, signed receipt reconciliation, visible bounded retries | Provider/outbox/worker/webhook tests and Settings browser flow |
| 2070 | Dismissible setup progress derived from real data and safe capability metadata | Database/action/component tests and stakeholder browser flow |
| 2071 | Explicit bounded text/Markdown context, untrusted source handling, citations and deletion semantics | Extraction, tenant authorization, citation, history and browser tests |
| 2072 | Current-member mentions and subscriptions for comments, status and decisions | Deduplication, preferences, membership and browser tests |
| 2073 | Assignment, commitment, period, manual ranking, OKRs and reconciled capacity in days | Version/concurrency, capacity and keyboard browser tests |
| 2074 | Incremental Linear status polling, guarded mapping, checkpoints, conflicts and reconciliation | Provider, lifecycle, retry, scheduler and action tests |
| 2075 | Durable Teams events and authenticated tenant/member-scoped create/status commands | JWT/ingress, concurrent replay, outbox and readiness tests |
| 2076 | Archive/restore and bulk actions with preserved history and active-query exclusion | Database authorization, workflow locks, analytics and browser tests |
| 2077 | Deployment-bounded budgets, serialized admission, conservative reservations and durable unknown usage | Concurrency, rollover, telemetry, stale configuration, permissions and responsive Settings tests |

Independent reviews covered each implementation slice. Review fixes include current-membership rechecks, provider idempotency windows, frozen payloads, stale form versions, cross-tenant outcome authorization, document-text deletion, and reservation accounting before budget activation.

## Integration checks

- Full Vitest suite: 147 files, 1,113 tests passed against disposable PostgreSQL.
- Repository ESLint and TypeScript checks passed.
- Production build passed.
- All migrations 0001 through 0055 applied in order to a fresh disposable database.
- Production browser suite: 35 Chromium tests passed, including desktop/mobile, 200% text, authorization, workflow recovery, workspace switching and the new feature flows.

## Rollout and live validation

Apply additive migrations 0045–0055 before deploying the application. Preserve existing records; do not run down migrations as a routine rollback. A code rollback can retain the additive schema. Check the deployed commit, CI, health endpoint and authenticated workflows after rollout.

Production was inspected read-only on 2026-09-09 and currently has migrations through 0044. Email configuration is unavailable in the inspected deployment. No live email or Teams message was sent as part of implementation.

Email requires a verified sender, canonical application URL, worker scheduling and a signed Resend webhook. See [email operations](email-delivery.md). Live sender and receipt validation remains outstanding.

Teams notifications and commands stay independently gated until their account-backed deployment tests pass. Approvals remain unsupported. See [Teams operations](teams-delivery.md). Do not enable the validation flags solely because mocked tests pass.

Tracker imports and Linear polling require deployment-specific credential/pagination/revocation and scheduler validation. Routine tests mock external providers. AI cost controls use standard global non-fast Anthropic list-price estimates, not provider billing; update the server pricing bounds before enabling a different pricing mode.

The parent and account-dependent issues must remain open while their required live evidence is outstanding. Code completion and local verification alone do not establish production delivery.
