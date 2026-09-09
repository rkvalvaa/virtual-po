# CCT-2073 capacity planning implementation plan

## Contract

Add a keyboard-accessible planning table for active requests. Reviewers and
administrators can set a current member as assignee, a Now/Next/Later
commitment, a quarter target period, a manual rank, a linked active objective,
and a planned effort estimate measured in days. Keep manual planning fields and
their audit trail separate from the AI priority score and assessment history.

Capacity continues to use quarter/day units. Preserve `allocated_days` as a
legacy value. Until an administrator chooses how it relates to request-derived
effort, show legacy and request-derived values separately and do not calculate
remaining capacity. Reconciliation records either that request planning
replaces the legacy allocation or that the legacy allocation represents work
outside VPO. Only then calculate effective allocation and over-allocation.
Story points remain visible as a separate estimate and are never converted to
days. Missing effort estimates are counted explicitly. Target periods are
planning intentions rather than delivery guarantees.

## Steps

1. Add failing PostgreSQL tests for tenant isolation, current-member and active
   objective validation, archived request rejection, audit records, stale-write
   protection, and both capacity reconciliation modes without double counting.
2. Add migration `0052_request-planning.js` with request planning columns,
   reconciliation metadata on `team_capacity`, and a dedicated planning audit
   table.
3. Implement focused planning queries and capacity summaries in
   `lib/db/queries/planning.ts`; keep authorization context explicit and update
   request plus audit atomically under a row lock.
4. Add server actions with reviewer/admin editing, admin-only reconciliation,
   schema validation, and path revalidation.
5. Add the `/planning` server page and a client table with native form controls,
   distinct manual and AI rank columns, explicit units, warnings, and no drag
   interaction. Link it from the shared navigation.
6. Update Capacity settings and strategic assessment context so unreconciled
   legacy allocation is never presented as reliable remaining capacity.
7. Run focused PostgreSQL and component tests, TypeScript, focused ESLint, and
   diff checks. Do not run a production build while the shared dev server is
   active.

## Verification evidence (2026-09-09)

- RED: the first PostgreSQL run failed because `lib/db/queries/planning.ts` did
  not exist. The action and component runs then failed because their modules
  did not exist.
- Applied only additive migration `0052_request-planning` to the disposable
  PostgreSQL database using `--use-glob --no-check-order`; no production
  database was touched.
- GREEN: planning query, server-action, and component tests passed 10/10 across
  three files against the disposable database and mocked action boundary.
- GREEN: a combined import, Linear sync, and planning regression run passed
  61/61 tests across 12 files.
- GREEN: `npx.cmd tsc --noEmit`, focused ESLint, and `git diff --check` completed
  with no errors. A production build was intentionally not run while the
  shared development server was active.
- GREEN: `e2e/planning.spec.ts` passed 1/1 in Chromium against the shared local
  development server. It exercised sidebar navigation, all native row controls,
  persistence, the unreconciled warning, explicit outside-work reconciliation,
  and visible over-allocation in days.
