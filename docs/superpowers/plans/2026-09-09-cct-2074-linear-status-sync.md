# CCT-2074 Linear status synchronization

## Implemented contract

- Scheduled `/api/cron/tracker-status-sync` polling is fail-closed behind `CRON_SECRET` and claims each due configuration once with `FOR UPDATE SKIP LOCKED`.
- Linear polling uses a persisted checkpoint with a five-minute overlap, stable team/issue/state IDs, cursor pagination, event fingerprints, stale-event rejection, and a linked-issue reconciliation pass whenever the persisted last reconciliation is at least 24 hours old.
- Administrators load server-verified Linear workflow states, map each allowed state to a VPO request status, enable polling, run reconciliation, and see the last checkpoint, last sync, bounded retry count, and provider error.
- Each linked request stores the last accepted local status and last observed remote status. A later local edit, an invalid lifecycle edge, or an approval/rejection target creates a visible conflict instead of overwriting the request.
- Human resolution and automatic polling share the same guard. They reject archived requests, active AI runs, active export leases, stage-completion bypasses, unsupported pre-approval transitions, and invalid lifecycle graph edges. Approval and rejection continue through the existing in-app decision/approval path.
- This release has no outbound Linear status operation, so inbound observations cannot feed back into Linear.

## Test evidence

- Disposable PostgreSQL: `postgresql://postgres:***@127.0.0.1:55435/vpo_audit`.
- Applied additive migration `0049_tracker-status-sync` locally with `node-pg-migrate`; no production database was touched.
- Fresh combined import, CCT-2074, and planning regression run: 61/61 tests across 12 files passed, including elapsed-time reconciliation, stale-order, concurrent-claim, archived-request, active-run, active-export, and incomplete-stage guards.
- Focused ESLint passed for status-sync, import, Linear/Jira settings actions and components, and cron files.
- `npx.cmd tsc --noEmit`, focused ESLint, and `git diff --check` completed with no errors after integration with the concurrent email, document, archive, and Teams work.
- No live provider mutations were executed; provider reads were mocked in tests.

## Live validation limitation

The Linear GraphQL incremental filter, revoked-key response, and scheduler timing still require a connected test Linear workspace after deployment. Runtime configuration and routine tests intentionally avoid live provider effects.
