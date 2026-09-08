# CCT-2039 remediation tracker

Goal: satisfy all fourteen child issues of CCT-2039, prioritizing security and broken core workflows. The Linear acceptance criteria are the requirements; this tracker does not narrow them.

Execution: inline, in focused test-first batches on `fix/cct-2039-project-hardening`. Keep unrelated existing docs untouched. Database verification uses only the disposable `vpo-audit-pg` container on localhost:55435. No live AI, messaging, or production database mutations.

## Priority and implementation boundaries

- [ ] CCT-2041: constrain AI story writes atomically to epic → request → organization. Test actual tool execution against two database tenants and another request in the same tenant.
- [ ] CCT-2042: shared outbound HTTP(S) URL policy, public-address DNS validation pinned to the connection, redirects disabled, bounded delivery. Apply to webhook create/update and send; test private/encoded/mapped addresses and redirects.
- [ ] CCT-2052: refresh JWT membership from PostgreSQL on every server session access; revoke missing membership and honor demotions. Test existing sessions after DB mutations.
- [ ] CCT-2043: shared agent authorization and conditional transactional lifecycle mutations; prevent concurrent/replayed runs and protect requester ownership. Test normal, denied, terminal, and concurrent transitions.
- [ ] CCT-2040: explicit machine endpoint proxy exceptions with endpoint authentication preserved. Keep Teams unavailable until protocol verification exists. Test real HTTP requests through Next.js.
- [ ] CCT-2044: remove render-time creation and implement idempotent start/retry. Test disabled templates, Strict Mode, slow and failed start.
- [ ] CCT-2045: persisted stage state and explicit user actions from intake through assessment/output, live progress and retry. Exercise the complete flow with mocked AI tool calls.
- [ ] CCT-2046: persist validated messages/tool state, restore stable draft URL, resume and retry without duplicates or transcript loss. Test reload and tenancy.
- [ ] CCT-2047: grouped responsive Settings navigation and stacked intake guidance, verify mobile/laptop and keyboard/zoom behavior in browser.
- [ ] CCT-2048: shared PostgreSQL AI quotas and leased run limits, bounded/validated input and output, actionable errors. Test across concurrent callers.
- [ ] CCT-2049: durable webhook outbox and attempts with leases/backoff, stable event IDs, admin delivery visibility/redelivery. Test failures and worker interruption.
- [ ] CCT-2050: one-subscription test delivery with truthful result; admin-only one-time signing secret creation/rotation. Test differing event subscriptions.
- [ ] CCT-2051: admin-only repository mutations with provider-verified metadata and UI feedback. Test forged inputs and roles.
- [ ] CCT-2053: explicitly disable unsupported Teams commands and accurately present integration capabilities unless full authenticated Bot Framework handling is implemented. No false success acknowledgements.

## Completion evidence

Each completed item records changed files, regression checks and limitations in Linear. Final acceptance includes lint, strict type checking, all database tests, production build and browser tests covering the actual fixed paths. Tickets remain open until their acceptance criteria are verified. Full epic completion requires all fourteen items, not only the first security batch.
