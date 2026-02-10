# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Virtual Product Owner (VPO)** — an AI-powered application that streamlines feature request intake, assessment, and prioritization using the Anthropic Agent SDK. Transforms vague feature requests into structured epics and user stories through three specialized AI agents (Intake, Assessment, Output).

The full PRD is at `reference/VIRTUAL_PO_PRD.md`, quickstart at `reference/VPO_QUICKSTART.md`, and implementation plan at `reference/IMPLEMENTATION_PLAN.md`.

## Commands

```bash
npm run dev      # Start dev server (http://localhost:3000)
npm run build    # Production build
npm run start    # Start production server
npm run lint     # ESLint (flat config, ESLint 9)
npm run migrate  # Run database migrations (once configured)
npm run test     # Run tests (once configured)
```

## Tech Stack

- **Framework**: Next.js 16 (App Router) with TypeScript (strict mode)
- **Styling**: Tailwind CSS v4 (via `@tailwindcss/postcss` plugin) + shadcn/ui
- **Linting**: ESLint 9 flat config with `eslint-config-next` (core-web-vitals + typescript)
- **Database**: PostgreSQL with `pg` library (NO Prisma — use raw SQL with parameterized queries)
- **Migrations**: node-pg-migrate for database schema migrations
- **AI**: Vercel AI SDK v6 (`ai` + `@ai-sdk/anthropic` + `@ai-sdk/react`) for conversational agents and streaming chat. See `reference/AGENT_SDK_RESEARCH.md` for full rationale. Claude Agent SDK reserved for Phase 2 autonomous tasks only
- **Auth**: NextAuth.js with OAuth providers
- **State**: Zustand (client), React Query (server state)
- **Validation**: Zod
- **Fonts**: Geist Sans + Geist Mono via `next/font/google`
- **Package manager**: npm

## Project Structure

Root-level `app/` directory (Next.js App Router). Key directories:

```
app/                  # Next.js App Router pages and API routes
  (auth)/             # Auth routes (login, callback)
  (dashboard)/        # Main app routes (requests, review, backlog, analytics, settings)
  api/                # API route handlers
lib/                  # Shared libraries
  agents/             # Anthropic Agent SDK integration (client, prompts, tools)
  db/                 # Database client, queries, connection pool
  auth/               # Auth utilities
  types/              # TypeScript type definitions
  utils/              # Helper functions
components/           # React components
  ui/                 # shadcn/ui base components
  chat/               # Agent chat interface
  requests/           # Feature request components
  review/             # Review workflow components
  layout/             # Layout components
hooks/                # Custom React hooks
config/               # App configuration (scoring, workflows)
migrations/           # PostgreSQL migration files (raw SQL)
reference/            # Product documentation and plans
```

## Architecture

Three AI agents in a pipeline:
1. **Intake Agent** — Conversational feature request gathering with quality scoring
2. **Assessment Agent** — Business value, technical complexity, and risk analysis (RICE/WSJF)
3. **Output Agent** — Epic and user story generation with acceptance criteria

Data flow: Stakeholder → Intake Agent → Assessment Agent → Output Agent → Review Queue → Backlog

Request lifecycle: DRAFT → INTAKE_IN_PROGRESS → PENDING_ASSESSMENT → UNDER_REVIEW → APPROVED/REJECTED/DEFERRED → IN_BACKLOG → IN_PROGRESS → COMPLETED

## Path Aliases

`@/*` maps to `./*` (project root) — configured in `tsconfig.json`

---

## Development Principles

### Next.js App Router Best Practices

- **Server Components by default** — only add `'use client'` when you need interactivity, browser APIs, or hooks
- **Server Actions** for mutations — prefer over API routes for form submissions and data mutations from components
- **Route Handlers** (`app/api/`) only for external API endpoints, webhooks, and agent streaming endpoints
- **Data fetching in Server Components** — fetch data at the component level, not in client components. Use `fetch()` with Next.js caching or direct DB queries
- **Streaming & Suspense** — use `loading.tsx` and `<Suspense>` boundaries for progressive loading
- **Metadata API** — use `generateMetadata()` for dynamic page titles/descriptions
- **Error boundaries** — use `error.tsx` at route segment level
- **Parallel routes and intercepting routes** where they simplify UI patterns (modals, split views)
- **Image optimization** — always use `next/image` for images
- **Avoid barrel exports** (`index.ts` re-exports) — they hurt tree-shaking. Import directly from the source file

### Clean Code

- **Meaningful names** — variables, functions, and files should clearly describe their purpose
- **Small, focused functions** — each function does one thing. If a function exceeds ~30 lines, consider splitting
- **Single Responsibility** — each module/file has one reason to change
- **Explicit over implicit** — prefer clear, readable code over clever abstractions
- **DRY without premature abstraction** — duplicate code is acceptable until you've seen the pattern 3+ times
- **No dead code** — remove unused imports, variables, functions, and commented-out code
- **Consistent patterns** — follow existing patterns in the codebase. If the codebase uses a pattern, continue it
- **Type everything** — use TypeScript strict mode. Avoid `any`. Define interfaces for all data shapes
- **Colocate related code** — keep components, hooks, types, and utilities close to where they're used

### Database Conventions (Raw PostgreSQL)

- **ALWAYS use parameterized queries** — never interpolate user input into SQL strings. Use `$1, $2, ...` placeholders with the `pg` library
- **Connection pooling** — use a shared `Pool` instance from `pg`, never create connections per request
- **Migrations** — all schema changes go through `node-pg-migrate` migration files in `migrations/`. Never modify the database manually
- **Migration naming** — use descriptive names: `YYYYMMDDHHMMSS_create-users-table.sql`
- **Transactions** — use transactions for multi-step operations. Use `pool.connect()` then `client.query('BEGIN')` / `COMMIT` / `ROLLBACK`
- **Query functions** — keep SQL queries in dedicated files under `lib/db/queries/`. Export typed functions, not raw query strings
- **Snake_case in DB, camelCase in TS** — database columns use snake_case. Map to camelCase in TypeScript at the query layer

### PR Workflow

- **Branch naming**: `feature/<short-description>`, `fix/<short-description>`, `chore/<short-description>`
- **One feature per PR** — keep PRs focused and reviewable
- **PR description** — include summary, what changed, and test plan
- **Link Linear issues** — reference Linear issue IDs in PR descriptions

### Mandatory Reviews After Major Changes

#### Code Review Checklist
After completing each major feature or significant change, review for:
- [ ] Correctness — does the code do what it's supposed to?
- [ ] Readability — can another developer understand this quickly?
- [ ] Performance — no N+1 queries, unnecessary re-renders, or missing indexes
- [ ] Error handling — are errors caught and handled at appropriate boundaries?
- [ ] Type safety — no `any` types, proper null checks, exhaustive switch statements
- [ ] Pattern consistency — follows established patterns in the codebase
- [ ] No dead code, no TODO comments without linked issues

#### Security Review Checklist
After completing each major feature or significant change, review for:
- [ ] **SQL Injection** — ALL queries use parameterized placeholders (`$1, $2`), never string concatenation
- [ ] **XSS Prevention** — user-generated content is properly escaped. React handles this by default, but watch for `dangerouslySetInnerHTML` and raw HTML rendering
- [ ] **Authentication** — all protected routes/API endpoints verify the user session
- [ ] **Authorization** — users can only access/modify their own data and resources within their organization. Check role-based access (STAKEHOLDER, REVIEWER, ADMIN)
- [ ] **Input Validation** — all API inputs validated with Zod schemas before processing
- [ ] **CSRF Protection** — Server Actions have built-in CSRF protection; verify custom API routes
- [ ] **Secrets** — no API keys, tokens, or credentials in code. All secrets in environment variables
- [ ] **Rate Limiting** — public-facing endpoints have rate limiting
- [ ] **File Uploads** — validate file type, size, and sanitize filenames
- [ ] **Dependency Safety** — check for known vulnerabilities with `npm audit`

### Testing Conventions

- **Test files** colocated with source: `component.test.tsx` next to `component.tsx`
- **Unit tests** for utility functions, database query functions, and agent tool handlers
- **Integration tests** for API routes and agent workflows
- **Component tests** for interactive UI components
- **Name tests descriptively** — `it('should reject feature request when user lacks REVIEWER role')`

---

## Conventions

- Tailwind v4 uses `@theme inline` in CSS for design tokens (see `globals.css`)
- Dark mode uses `prefers-color-scheme` media query with CSS custom properties
- ESLint ignores: `.next/`, `out/`, `build/`, `next-env.d.ts`
