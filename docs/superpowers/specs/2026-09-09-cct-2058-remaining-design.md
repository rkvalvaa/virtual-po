# CCT-2058 remaining subissues: proposed design

Date: 2026-09-09
Status: approved by the user on 2026-09-09; implementation in progress.

## Scope and authoritative baseline

Complete all eleven currently open children of CCT-2058: CCT-2063 and CCT-2068 through CCT-2077. The eight high-priority children are marked Done in Linear. The existing high-priority remediation plan explicitly excludes these remaining issues and is not authorization evidence for their design. The current checkout is branch fix/cct-2058-high-priority at 6c18b24. Existing untracked files must be preserved. No .codegraph directory exists.

The Linear acceptance criteria below remain authoritative. Completion requires implementation, relevant database and browser evidence, integration checks, and verified delivery state; a design or a locally passing unit test does not complete an issue.

## Approach

Extend the existing Next.js application, PostgreSQL queries, server actions, and settings components. Keep migrations additive and preserve existing tenant authorization and lifecycle checks. Use a durable database outbox for notification delivery and explicit provider linkage for import/synchronization. This fits the existing webhook outbox pattern and avoids relying on process lifetime for serverless work.

An alternative is to introduce an external workflow service for all background work, but that adds deployment and account dependencies to an application that already has a database and worker/cron conventions. Another alternative is synchronous provider delivery, which does not meet durability requirements. Prefer database-backed workers with leases, bounded retries, stable delivery IDs, and operator-visible failures.

Implement and verify in dependency order:
1. Workspace selection (2063).
2. Import linkage and reconciliation (2068).
3. Durable email and shared notification delivery foundations (2069).
4. Setup checklist (2070) and document context (2071).
5. Mentions and subscriptions (2072), then planning (2073).
6. Linear status synchronization (2074), using import/export linkage.
7. Teams notifications and scoped commands (2075), using delivery foundations.
8. Archiving (2076), integrating active runs and all active queries.
9. Budget controls (2077), integrating admission and telemetry.

## Workspace selection: first implementation slice

Current source evidence:
- auth.ts already validates update-session organization IDs against current membership and rereads roles.
- lib/auth/org-setup.ts chooses the first membership with LIMIT 1 and no preference.
- components/layout/Sidebar.tsx has no active organization or selector.
- app/(dashboard)/layout.tsx loads notifications by user alone.
- lib/db/queries/notifications.ts and notification-actions.ts read/count/update notifications across organizations.

Add an optional preferred organization ID to the user record. Resolve it through a membership join at sign-in; fall back deterministically to an existing membership when revoked. Do not create a new workspace while refreshing a revoked token. If no valid membership remains during refresh, invalidate authorization and send the user through sign-in.

Render one shared, labeled native selector in the desktop navigation and mobile drawer, and show the active name in the mobile header. Server-load only memberships for the signed-in user and expose only IDs, names, and current roles. Long names must wrap or truncate within the navigation width without hiding the accessible full label.

A server action validates a UUID and current membership, updates the remembered preference, and updates the session. The JWT callback derives the role from the database regardless of submitted role data. An invalid or concurrently revoked target produces an actionable error and never grants access. Successful switching performs a full navigation to /requests to discard client state, active request URLs, and router caches. Warn before abandoning unsaved form data through the application's applicable form guard; use a normal navigation so browser unload handling can run. Other tabs must refresh on a workspace-switch broadcast or regain of focus before displaying stale protected content.

Require organization ID and current membership in notification list, unread count, mark-one, and mark-all queries and callers. This closes the observed stale-workspace notification path as part of the switching requirement.

Verification: different roles across two workspaces; forged org/role input; membership revoked before switch and after preference persistence; sign-out/sign-in restoration; fallback with another membership and with none; organization-scoped notification reads and updates; full browser switch with distinct request/notification fixtures; desktop/mobile and keyboard selection; no retained administrator action after switching.

## Other feature contracts

### Imports (2068)
Introduce unique linkage by local organization, provider, remote workspace/destination, and stable entity ID. Preserve title, description, source URL, labels, and remote status in a documented metadata mapping. Preview paginated provider results before import and report created/updated/skipped/failed counts. Keep the last imported content snapshot: update unmodified local fields, surface changed local fields as conflicts, and require explicit resolution before overwriting. Concurrent repeated imports must converge on one request.

### Email (2069)
Reuse validated application URL and safe text rendering from the existing invitation implementation where appropriate. Persist notification delivery before returning, use stable provider idempotency keys, lease due work, cap retry/backoff, and persist final errors. Distinguish unavailable configuration, queued, accepted by provider, failed, and confirmed delivery where provider evidence exists. Do not label provider acceptance as inbox delivery. Expose readiness and an admin-triggered test to the current administrator's address, plus status and retry controls. Verify provider-returned errors as well as thrown errors and ambiguous outcomes.

### Setup (2070)
Derive checklist completion from actual workspace name, invitations/members, repository/business context, and first request. Store dismissal separately so users can resume without losing actual completion. Use direct settings anchors, permission-appropriate actions, explicit optional integrations, and safe readiness metadata. Demo data is opt-in only.

### Document context (2071)
Initially support UTF-8 plain text and Markdown only, with explicit selection per attachment. Authorize access before reading managed blob content; enforce byte, file-count, and extracted-token limits. Persist processing state, bounded extracted text, content hash, and truncation/omission metadata. Keep document text in untrusted context blocks distinct from system instructions and emit citations referencing selected attachment IDs and passages. Display citations with tenant-protected source links. Attachment deletion removes extracted text and selection; retained assessment snapshots indicate a removed source without retaining deleted document text. Unsupported formats remain visibly unsupported.

### Mentions/subscriptions (2072)
Use an accessible current-member picker and stable mention IDs alongside readable comment text. Validate request access and membership on the server. Persist unique request subscriptions. Build notification recipients from owner, subscribers, and mentions, deduplicate IDs, remove actor and inaccessible/removed memberships, then apply preferences. Preserve readable names after membership removal without granting access through old mention IDs.

### Planning (2073)
Expose current-member assignee, Now/Next/Later commitment, target period, manual rank, and existing OKR linkage. Display capacity and allocated effort in the existing capacity unit; report unknown estimates separately and never silently convert points into days. Audit manual changes separately from AI score history. Use keyboard-accessible table controls; drag-and-drop is unnecessary. Treat target periods as planning intentions, not guaranteed dates.

Source verification confirms capacity is stored by quarter in days, with a manually entered allocated_days total. Add explicit planned effort in days independently of story points. Preserve the existing allocated_days value as the legacy allocation until an administrator explicitly reconciles it: display legacy allocation and request-derived allocation separately, and flag the total as unreconciled instead of adding potentially overlapping totals or claiming reliable remaining capacity. The reconciliation action records whether legacy allocation is replaced by request planning or retained as additional work outside VPO. Once reconciled, compare the resulting allocation with total_capacity_days and show over-allocation. Test preservation of existing capacity data and prevention of double counting.

### Linear status sync (2074)
Begin with authenticated scheduled incremental polling, plus explicit administrator reconciliation. Reuse stable tenant-scoped import/export linkage. Admins configure allowed source-status mappings. Persist provider checkpoints, last observed state, last sync/error, and event fingerprints. Invoke existing lifecycle/approval guards rather than writing arbitrary statuses. Preserve conflicting local changes and show a human resolution action. Periodic reconciliation repairs missed polls; revoked credentials become visible errors with bounded retries. Do not push status changes back in the first release, avoiding bidirectional feedback loops.

### Teams (2075)
Deliver selected events using the durable delivery contract. Configure Bot Framework application/audience/tenant and verified Teams-to-VPO identity bindings; never trust display names or caller-supplied email as identity. Support create and status commands only after authenticated tenant and current membership checks. Approvals are excluded from the first release and explicitly shown as unavailable. Expose channel delivery status and bounded retries. Enable each capability only after its corresponding end-to-end validation; live account-dependent validation must be recorded as incomplete until exercised.

### Archiving (2076)
Add archive metadata separate from workflow status. Owners may archive their own drafts; reviewers/admins may archive other authorized workspace requests. Preserve prior lifecycle status, decisions, comments, external links, and attachments on archive/restore. Exclude archived rows from active lists, counts, analytics inputs, planning, and agent admission; provide an explicit archived view. Reject archive while a run/export mutation holds an active lease, with an actionable retry message. Bulk actions apply the same checks per item and report partial failures. No permanent deletion without a separately approved retention policy.

### Budget controls (2077)
Expose authoritative allowance, reset time, reservations, and block reason. Admin budgets may tighten deployment ceilings only. Serialize admission with existing organization quota locks and reserve a conservative upper bound for in-flight model work; refuse admission without enough headroom. Settle against server telemetry, retaining reservations when reporting fails until reconciliation can determine usage. Version configuration and record threshold notifications once per budget window. Label calculated spend as estimates, separate from provider billing. Test concurrent admission, rollover, cross-tenant reads, failures, and attempts to relax deployment ceilings.

Source verification confirms telemetry currently converts missing token counts to zero and logs database recording failures without durable recovery. Budget settlement must distinguish measured zero from unknown usage and persist a run-linked settlement record. Unknown usage or failed recording must not release the reservation as zero spend. Estimate the reservation across all allowed steps, including repeated context and bounded tool results; cap those inputs before admitting a run. Reject models without a server-known price ceiling while a hard budget is enabled. A lost worker lease alone cannot prove that billable work stopped or that its reservation is safe to release.

## Verification and delivery

For each slice, begin with regressions covering the actual failure or boundary, use disposable PostgreSQL for concurrency/constraint tests, and run affected component/browser tests. Run lint, TypeScript, production build, and the full suite after integration. Reuse existing browser fixture cleanup conventions. Mock provider effects during routine tests; record live end-to-end limitations honestly.

Before marking any Linear issue Done, map every criterion below to current code and test/runtime evidence, and inspect the relevant PR/CI/deployment state. Do not close the parent until all eleven slices and their required evidence are complete. Preserve the older high-priority work and inspect its integration state before delivery.

## Authoritative acceptance checklist

### CCT-2063: Add an active workspace selector with validated organization switching

- [ ] Show active workspace name in desktop/mobile navigation and list only memberships of the signed-in user.
- [ ] Implement a server-validated switch that refreshes session authorization and clears or scopes cached workspace data.
- [ ] Restore the selected workspace on future visits and handle revoked membership gracefully.
- [ ] Verify users with different roles in two workspaces cannot retain elevated rights or see stale data after switching.

### CCT-2068: Preserve tracker context and prevent duplicate requests during backlog imports

- [ ] Use stable provider/workspace/entity IDs to link imports and make repeated imports idempotent.
- [ ] Preserve descriptions, source URL, and relevant labels/status metadata with an explicit mapping and preview.
- [ ] Support pagination/progress and report created, updated, skipped, and failed records.
- [ ] Avoid overwriting later local edits without a conflict policy; test repeated import and provider IDs reused in different organizations.

### CCT-2069: Finish email delivery readiness, safe rendering, and failure visibility

- [ ] Expose configured/unavailable status and an admin test-delivery path without revealing credentials; use a verified sender.
- [ ] Build links from one validated application base URL and escape untrusted text in HTML templates.
- [ ] Persist delivery work or otherwise guarantee completion on serverless; handle both thrown and returned errors with bounded retry and visible delivery status.
- [ ] Verify correct production URLs, literal rendering of HTML-like request titles/names, unavailable-provider feedback, and retry behavior without duplicating messages.

### CCT-2070: Guide new workspaces through setup and show integration readiness

- [ ] Offer a dismissible/resumable checklist for workspace naming, inviting teammates, repository/business context, and first request.
- [ ] Show ready/not configured/unsupported/error states for relevant capabilities using safe server-provided metadata.
- [ ] Link directly to the required Settings section and explain which integrations are optional.
- [ ] Respect admin vs stakeholder permissions; keep demo/sample data opt-in and clearly marked.

### CCT-2071: Use selected supporting documents in AI assessments with source citations

- [ ] Let users explicitly select supported attachments as AI context and display pending/processed/unsupported/error status.
- [ ] Extract bounded content with tenant authorization, safe file handling, and documented retention/deletion behavior.
- [ ] Treat document content as untrusted input and keep it separate from agent instructions; show source citations for document-derived claims.
- [ ] Make token/file limits and omitted/truncated material visible; begin with a small documented set of formats before adding external document connectors.

### CCT-2072: Add mentions and request subscriptions for targeted collaboration

- [ ] Resolve @mentions to stable current-organization member IDs using an accessible picker.
- [ ] Allow follow/unfollow of a request and notify relevant subscribers/mentions according to preferences.
- [ ] Deduplicate owner/subscriber/mention notifications, omit self-notifications, and avoid exposing inaccessible request content.
- [ ] Keep comments as readable text when members leave and prevent cross-organization mention spoofing.

### CCT-2073: Add request ownership and a capacity-aware delivery planning view

- [ ] Start with assignee selection, target period, and an accessible Now/Next/Later or equivalent planning view.
- [ ] Link planned work to existing OKRs and capacity data, showing over-allocation with explicit estimate units.
- [ ] Make manual ranking/commitment distinct from AI priority recommendations and record changes.
- [ ] Restrict assignment to current members and keep keyboard/table alternatives for any drag interaction; avoid implying delivery dates are guaranteed.

### CCT-2074: Synchronize linked tracker status with explicit mapping and conflict handling

- [ ] Start with one provider (Linear) and authenticated inbound delivery or incremental polling, then reuse the contract for others.
- [ ] Let admins configure allowed external-to-VPO status mappings and display last sync/error state.
- [ ] Deduplicate events and prevent sync loops; preserve local approval/lifecycle rules and surface conflicts for human resolution.
- [ ] Keep source IDs organization-scoped, handle revoked credentials, and reconcile missed events; depend on reliable export/import linkage.

### CCT-2075: Implement real Teams notifications and authenticated request commands

- [ ] Deliver selected request events through a durable Teams notification pipeline with delivery status and retries.
- [ ] If commands are included, validate Bot Framework identity/audience/tenant and map Teams users to authorized VPO memberships.
- [ ] Support scoped create/status actions with clear linking and errors; define whether approvals are included in the first release.
- [ ] Only enable settings and advertise individual capabilities once corresponding end-to-end tests pass; retain truthful unavailable states otherwise.

### CCT-2076: Add request archiving and a safe cleanup workflow for abandoned drafts

- [ ] Provide archive/restore with an archived view and exclude archived requests from active queues/counts by default.
- [ ] Allow owners to clean up their own drafts and define reviewer/admin rights for other requests.
- [ ] Preserve decisions, comments, external links, and audit history; require an explicit retention policy before permanent deletion.
- [ ] Handle bulk actions, attachments, active agent runs, and restore semantics consistently; do not hard-delete externally linked records implicitly.

### CCT-2077: Expose AI quota usage and add configurable workspace spending controls

- [ ] Show current usage, remaining run allowance, reset timing, and a clear explanation when a run is blocked.
- [ ] Allow admins to configure workspace budgets within deployment-enforced ceilings with threshold notifications.
- [ ] Distinguish estimated spend from billed usage and account for concurrent in-flight work when enforcing a hard budget.
- [ ] Add tests for tenant isolation, concurrent budget admission, rollover, and reporting failures; prevent client-provided limits from relaxing server controls.
