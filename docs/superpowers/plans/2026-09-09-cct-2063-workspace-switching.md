# Workspace switching implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement task by task in this session.

**Goal:** Complete CCT-2063 without losing the scope of the other ten remaining children.

**Architecture:** Persist a membership-validated workspace preference; derive session authorization from current membership. Server-render a safe membership list and discard client state on switches. Scope notifications to the active workspace.

**Tech Stack:** Next.js, Auth.js, PostgreSQL, React, Vitest, Playwright.

**Spec:** ../specs/2026-09-09-cct-2058-remaining-design.md

## Constraints

Preserve unrelated files. Never trust submitted roles. Never provision membership during token refresh. All notification operations require both organization and user IDs. Retain all eleven subissues in the parent completion audit.

## Tasks

- [x] Add database regressions in lib/db/queries/workspaces.test.ts for preference persistence, unauthorized selection, deterministic fallback, and notification reads/counts/updates across two tenants. Run `npx vitest run lib/db/queries/workspaces.test.ts` against disposable PostgreSQL and confirm failures before implementing.
- [x] Add migration 0045_workspace-preference.js and lib/db/queries/workspaces.ts. Define `rememberWorkspace(userId: string, orgId: string): Promise<boolean>` using a membership-conditional update; define `getPreferredWorkspace(userId: string)` returning a current membership with role. Update org-setup.ts and auth.ts to use the preference at sign-in and save validated session switches.
- [x] Require organization scope in notifications.ts and every caller. Extend auth.test.ts for remembered sign-in and revoked preference behavior. Verify the existing last-membership revocation test continues to reject access.
- [x] Add workspace-actions.ts with `switchWorkspace(orgId: string)` returning a success/error result after membership validation and session update. Add action regressions for invalid, foreign, and concurrently revoked targets.
- [x] Add WorkspaceSelector.tsx with labeled native selection, pending/error state, full navigation to /requests, and cross-tab synchronization. Wire safe membership data into dashboard layout, desktop sidebar, mobile drawer, and mobile header. Verify component keyboard/error behavior.
- [ ] Add browser coverage for roles in two workspaces, scoped notifications, reloaded selection, mobile navigation, and discarded request state. Run relevant database/component tests, lint, TypeScript and build. Review changed code before closing the issue; retain honest delivery/CI limitations.

## Next slices

Implementation and local verification: preference/auth/notification/actions/guard tests pass; the three real-browser scenarios pass, including keyboard cancel with unsaved edits, cross-tab role refresh, mobile selection, sign-in preference, and revoked membership. Independent re-review found no important issues. A read-only `/api/auth/workspace` check avoids concurrent Auth.js session-cookie rotation during switching. Final aggregate build/CI/delivery remains tracked under the parent completion audit.

After this slice, implement separate plans for import linkage (2068), durable email (2069), setup (2070), document context (2071), collaboration (2072), planning (2073), Linear sync (2074), Teams (2075), archive/restore (2076), and budget controls (2077). Their approved contracts and full acceptance criteria remain in the spec.
