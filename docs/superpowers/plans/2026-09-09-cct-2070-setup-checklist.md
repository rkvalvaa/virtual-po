# Workspace Setup Checklist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dismissible, resumable workspace setup checklist whose completion and capability states come from current tenant data.

**Architecture:** Persist only each member's dismissal state. Derive checklist completion through one membership-scoped PostgreSQL query, and derive credential-free capability readiness from active integrations plus the existing email readiness helper. Render the checklist on the requests page and make every Settings action link select its hash-addressed section.

**Tech Stack:** Next.js 16, React 19, PostgreSQL, node-pg-migrate, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-09-cct-2058-remaining-design.md`

## Global Constraints

- Completion is derived from the current workspace name, current members or invitations, an active repository or business objective, and an existing feature request.
- Dismissal is per user and workspace, and the user can resume the checklist.
- Every query and mutation requires current organization membership.
- Capability metadata contains no credentials and distinguishes `READY`, `NOT_CONFIGURED`, `UNSUPPORTED`, and `ERROR`.
- Administrator-only links are not offered as actions to stakeholders or reviewers.
- Integrations are optional and no demo data is created automatically.
- Do not modify `app/(dashboard)/settings/page.tsx` or `app/(dashboard)/settings/SettingsContent.tsx`.
- Do not commit, deploy, or write to Linear.

---

### Task 1: Persist dismissal and derive setup progress

**Files:**
- Create: `migrations/0048_setup-progress.js`
- Create: `lib/db/queries/setup.ts`
- Create: `lib/db/queries/setup.test.ts`

**Interfaces:**
- Produces: `getWorkspaceSetup(orgId: string, userId: string): Promise<WorkspaceSetup | null>`
- Produces: `setWorkspaceSetupDismissed(orgId: string, userId: string, dismissed: boolean): Promise<boolean>`
- Produces: `getWorkspaceCapabilities(orgId: string, userId: string): Promise<SetupCapability[]>`

- [ ] Write real-PostgreSQL tests proving tenant membership is required, dismissal is isolated by user and workspace, resumption clears dismissal, and completion changes only when the corresponding organization/member-or-invitation/repository-or-objective/request rows exist.
- [ ] Run `npx vitest run lib/db/queries/setup.test.ts` with the disposable database and confirm the missing implementation fails.
- [ ] Add `workspace_setup_preferences` with an `(organization_id, user_id)` primary key, cascading foreign keys, `dismissed_at`, and timestamps.
- [ ] Implement the membership-scoped progress query and membership-conditional dismissal upsert.
- [ ] Map `emailReadiness()` to safe setup metadata; query only integration type and active state; return an `ERROR` capability without database details if integration readiness cannot be loaded.
- [ ] Run `npx vitest run lib/db/queries/setup.test.ts` and confirm all database cases pass.

### Task 2: Add authorized actions and checklist UI

**Files:**
- Create: `app/(dashboard)/requests/setup-actions.ts`
- Create: `app/(dashboard)/requests/setup-actions.test.ts`
- Create: `components/setup/SetupChecklist.tsx`
- Create: `components/setup/SetupChecklist.test.tsx`

**Interfaces:**
- Consumes: setup query functions from Task 1.
- Produces: `setSetupChecklistDismissed(dismissed: boolean): Promise<{ success: boolean; error?: string }>`
- Produces: `SetupChecklist({ setup, capabilities }: { setup: WorkspaceSetup; capabilities: SetupCapability[] })`.

- [ ] Write action tests for missing sessions, missing organization context, current-member dismissal, and concurrent membership revocation.
- [ ] Run the action test and confirm the missing action fails.
- [ ] Implement the action using session user and organization IDs only; revalidate `/requests` after a successful mutation.
- [ ] Write component tests for derived progress, dismiss/resume behavior, administrator links, stakeholder guidance, optional-integration copy, and all four readiness states.
- [ ] Run the component test and confirm the missing component fails.
- [ ] Implement an accessible checklist card with a progress label, semantic list, direct actions, pending/error feedback, and a compact resume state after dismissal.
- [ ] Run both action and component tests and confirm they pass.

### Task 3: Make Settings sections deep-linkable

**Files:**
- Modify: `components/settings/SettingsSections.tsx`
- Create: `components/settings/SettingsSections.test.tsx`

**Interfaces:**
- Consumes: `/settings#<section-id>` links from Task 2.
- Produces: hash-controlled desktop and mobile Settings navigation.

- [ ] Write component tests proving an initial valid hash selects its panel, navigation updates the hash, browser hash changes select panels, and invalid hashes leave the current selection unchanged.
- [ ] Run `npx vitest run components/settings/SettingsSections.test.tsx` and confirm the initial-hash case fails.
- [ ] Add one validated section-ID parser, initialize from the URL after mount, listen for `hashchange`, and update history when navigation selects a section.
- [ ] Run the Settings sections test and confirm it passes.

### Task 4: Mount and verify the checklist

**Files:**
- Modify: `app/(dashboard)/requests/page.tsx`

**Interfaces:**
- Consumes: `getWorkspaceSetup`, `getWorkspaceCapabilities`, and `SetupChecklist`.

- [ ] Load setup and readiness with the existing request-page data for the authenticated organization and render nothing if current membership vanished.
- [ ] Render `SetupChecklist` before request filters so a dismissed user still has a resumable compact control.
- [ ] Run the setup database, action, component, Settings navigation, workspace, and auth tests together.
- [ ] Run scoped ESLint and TypeScript verification; report unrelated concurrent failures separately.
- [ ] Coordinate with the root agent before any browser run because port 3000 and Playwright sessions are shared.
