# CCT-2068 Tracker Imports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import paginated Linear, Jira, and GitHub Issues backlogs into requests without duplicate requests or silent overwrites of local edits.

**Architecture:** Normalize all provider pages into one `TrackerImportItem` contract, then reconcile each item transactionally through a tenant-scoped linkage table. A stable `(organization, provider, destination, remote entity)` identity and a transaction advisory lock serialize concurrent repeats. The settings UI previews provider data and its explicit field mapping, imports the visible page, reports per-item/count progress, and resolves persisted conflicts field by field.

**Tech Stack:** Next.js 16 server actions, React 19, TypeScript 5.9, PostgreSQL, node-pg-migrate, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-09-cct-2058-remaining-design.md`

## Global Constraints

- Preserve title, description, source URL, labels, and remote status metadata.
- Preview paginated provider results before import and report created, updated, skipped, and failed counts.
- Keep the last accepted imported snapshot and require explicit resolution before overwriting locally changed fields.
- Scope identity by local organization, provider, remote destination, and stable remote entity ID.
- Mock provider effects in tests and use only the disposable PostgreSQL database at `postgresql://postgres:vpo_test@127.0.0.1:55435/vpo_audit`.
- Preserve existing exports and do not modify auth, layout, notifications, workspaces, or migration 0045.

---

### Task 1: Durable linkage and reconciliation

**Files:**
- Create: `migrations/0046_tracker-imports.js`
- Create: `lib/import/tracker-imports.ts`
- Create: `lib/db/queries/tracker-imports.ts`
- Test: `lib/db/queries/tracker-imports.test.ts`

**Interfaces:**
- Consumes: `query()` and `transaction()` from `lib/db/pool.ts`.
- Produces: `importTrackerItems(context, items)` returning created/updated/skipped/failed counts and item results; `resolveTrackerImportConflict(context, linkId, resolutions)` returning the reconciled result.

- [ ] Write database tests proving initial mapped content, repeat idempotency, concurrent convergence, destination/organization isolation, clean remote updates, persisted local-edit conflicts, and both explicit resolutions.
- [ ] Run `npx vitest run lib/db/queries/tracker-imports.test.ts` against the disposable database and verify the new module/schema failures.
- [ ] Add the linkage migration and minimal transactional implementation, using `pg_advisory_xact_lock(hashtextextended(identity, 0))` before lookup/create.
- [ ] Re-run the database test and keep the accepted snapshot unchanged for conflicted fields while advancing clean fields and status metadata.

### Task 2: Paginated provider adapters

**Files:**
- Modify: `lib/linear/client.ts`
- Modify: `lib/jira/client.ts`
- Modify: `lib/github/issues-client.ts`
- Create: `lib/import/provider-pages.ts`
- Test: `lib/import/provider-pages.test.ts`

**Interfaces:**
- Consumes: provider clients returned by the existing client factories.
- Produces: `previewLinearPage`, `previewJiraPage`, and `previewGitHubPage`, each returning `{ items, nextCursor }` in the shared normalized contract.

- [ ] Write failing HTTP-boundary/normalization tests with literal provider responses, including descriptions, URLs, labels, status metadata, stable IDs, and next-page cursors.
- [ ] Run the focused tests and verify failures are caused by missing page methods/adapters.
- [ ] Add page methods while retaining existing `searchIssues` methods and exports.
- [ ] Re-run focused client/adapter tests.

### Task 3: Authorized preview/import/resolve actions

**Files:**
- Create: `lib/import/actions.ts`
- Modify: `app/(dashboard)/settings/linear-actions.ts`
- Modify: `app/(dashboard)/settings/jira-actions.ts`
- Modify: `app/(dashboard)/settings/github-issues-actions.ts`
- Test: `app/(dashboard)/settings/tracker-import.test.ts`

**Interfaces:**
- Consumes: normalized previews and transactional import queries.
- Produces: provider-specific preview/import server actions and conflict-resolution actions, all requiring reviewer access, current-organization integration, and an allowed configured destination.

- [ ] Write failing action tests for permissions, configured destination validation, preview pagination, refetch-before-import, aggregate outcomes, and tenant-scoped conflict resolution.
- [ ] Run the action tests and verify expected failures.
- [ ] Implement thin provider wrappers around shared authorization/orchestration without changing existing action exports.
- [ ] Re-run action and tracker-export regressions.

### Task 4: User-visible import workflow

**Files:**
- Create: `components/settings/TrackerImport.tsx`
- Create: `components/settings/TrackerImport.test.tsx`
- Modify: `components/settings/LinearSettings.tsx`
- Modify: `components/settings/JiraSettings.tsx`
- Modify: `components/settings/GitHubIssuesSettings.tsx`

**Interfaces:**
- Consumes: provider-specific preview/import/resolve actions via callbacks.
- Produces: mapping disclosure, paginated preview, import-page control, created/updated/skipped/failed progress, and persisted per-field conflict controls.

- [ ] Write failing component tests for preview-before-import, mapping copy, next/previous page controls, outcome counts, failures, and keep-local/use-tracker conflict resolution.
- [ ] Run the component test and verify missing UI behavior.
- [ ] Implement the shared panel and mount it in all three connected provider settings.
- [ ] Re-run component and settings tests.

### Task 5: Integrated verification

**Files:**
- Modify only files above if verification exposes a covered defect.

- [ ] Apply only migration 0046 to the disposable database when migration 0045 is unavailable, using an explicit test-only runner.
- [ ] Run focused import DB, adapter, action, UI, and existing tracker-export tests.
- [ ] Run `npm run typecheck`, `npm run lint`, and the relevant wider Vitest suite.
- [ ] Record any live-provider/browser limitation honestly; do not perform live provider effects or Linear writes.

## Verification evidence (2026-09-09)

- RED: `npx.cmd vitest run lib/db/queries/tracker-imports.test.ts` failed because `./tracker-imports` did not exist.
- RED: `npx.cmd vitest run lib/import/provider-pages.test.ts` failed because `./provider-pages` did not exist.
- RED: `npx.cmd vitest run app/(dashboard)/settings/tracker-import.test.ts` failed because the preview/import action exports did not exist.
- RED: `npx.cmd vitest run components/settings/TrackerImport.test.tsx` failed because the component did not exist.
- GREEN: focused import/export integration ran 46 tests across 6 files with 0 failures against `postgresql://postgres:vpo_test@127.0.0.1:55435/vpo_audit`.
- GREEN: full `npm.cmd test -- --run` ran 972 tests across 113 files with 0 failures against the disposable database.
- GREEN: `npx.cmd tsc --noEmit` and import-owned ESLint paths completed with 0 errors.
- GREEN: `npm.cmd run build` compiled, type checked, and generated all application routes.
- `npm.cmd run lint` is blocked globally by five pre-existing errors in `.vercel/cct2058-rollout.cjs`; the import-owned focused lint is clean.
- No live provider calls, production database changes, commits, Linear writes, or deployment actions were performed. Browser-level live provider validation remains for integration delivery; the user-visible workflow is covered by Testing Library interaction tests.
