# Mentions and Request Subscriptions Implementation Plan

**Goal:** Add tenant-safe request following and stable member mentions to comments, with one preference-aware notification per current recipient.

**Architecture:** Persist request subscriptions and comment-to-user mention identifiers in additive migration 0051. Keep readable mention-name snapshots beside the identifiers, while every picker, mutation, and recipient lookup rechecks current request access and organization membership. Build one deduplicated recipient set from the request owner, current subscribers, and current mentioned members, exclude the actor, then call the existing atomic `notifyUser` boundary once per recipient.

**Spec:** `docs/superpowers/specs/2026-09-09-cct-2058-remaining-design.md`, CCT-2072.

## Task 1: Persistence and authorization

- Add `request_subscriptions` and `comment_mentions` in migration 0051 with unique keys and cascading request cleanup.
- Add real-PostgreSQL regressions for current-member listing, cross-tenant mention rejection, subscription uniqueness, revoked-member cleanup, readable mention snapshots, and deduplicated recipients.
- Implement membership-scoped queries and transactional comment/mention persistence.

## Task 2: Notification delivery

- Resolve owner, subscriber, and mention recipients from the current request organization.
- Deduplicate users, exclude the actor, and discard removed memberships.
- Deliver once per recipient through `notifyUser`, retaining the existing email preference and durable-outbox behavior.

## Task 3: Actions and accessible UI

- Extend the comment action with stable mentioned-user IDs and add a follow/unfollow server action.
- Add an accessible current-member picker that inserts readable names and sends IDs separately.
- Show persisted mention names on comments and a request follow control.
- Cover picker behavior, replies, follow state, action authorization, and error feedback.

## Task 4: Readiness and verification

- Derive setup document readiness from `isBlobConfigured()` and report `NOT_CONFIGURED` when storage is unavailable.
- Apply migration 0051 to disposable PostgreSQL.
- Run focused database/action/component suites, scoped ESLint, TypeScript, and whitespace checks. Do not run the root-owned browser or production build.
