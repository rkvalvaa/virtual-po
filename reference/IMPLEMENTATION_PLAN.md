# VPO Implementation Plan

**Multi-session development plan for Virtual Product Owner**
**GitHub:** https://github.com/rkvalvaa/virtual-po
**Linear:** VPO project with issues organized by phase
**Last updated:** February 2026

---

## Key Technical Decisions (Deviations from PRD)

| PRD Says | We Use Instead | Reason |
|----------|---------------|--------|
| `@anthropic-ai/sdk` with manual tool loops | **Vercel AI SDK v6** (`ai` + `@ai-sdk/anthropic` + `@ai-sdk/react`) | Built-in agent loops, streaming, React hooks, native Next.js integration |
| Prisma ORM | **`pg` library + `node-pg-migrate`** | Direct SQL control, raw parameterized queries |
| `src/` directory structure | **Root-level `app/`, `lib/`, `components/`** | Matches existing scaffold, simpler structure |
| JSON tool schemas | **Zod schemas + `tool()` helper** | Type-safe, validated at runtime |

See `reference/AGENT_SDK_RESEARCH.md` for full SDK comparison and code examples.

---

## Session Overview

| Session | Focus | Branch | Key Deliverables |
|---------|-------|--------|-----------------|
| 1 | Project infrastructure | `feature/project-setup` | Dependencies, DB setup, migrations, shadcn/ui |
| 2 | Database schema & queries | `feature/database-schema` | All migration files, typed query functions, connection pool |
| 3 | Authentication | `feature/auth` | NextAuth, OAuth, RBAC, protected routes |
| 4 | Intake Agent | `feature/intake-agent` | Agent prompts, tools, streaming API route, chat UI |
| 5 | Assessment Agent | `feature/assessment-agent` | Assessment logic, scoring, priority calculation |
| 6 | Output Agent | `feature/output-agent` | Epic/story generation, display components |
| 7 | Request management UI | `feature/request-management` | List, detail, status workflow, filtering |
| 8 | Review & approval workflow | `feature/review-workflow` | Review queue, decisions, comments |
| 9 | Dashboard & notifications | `feature/dashboard` | Analytics, email/in-app notifications |
| 10 | Polish & testing | `feature/testing` | E2E tests, error handling, responsive design |
| 11+ | Phase 2 & 3 | Various | Integrations, intelligence features |

---

## Session 1: Project Infrastructure

**Branch:** `feature/project-setup`
**PR title:** "Set up project infrastructure, dependencies, and tooling"

### Tasks

1. **Install core dependencies**
   ```bash
   npm install ai @ai-sdk/anthropic @ai-sdk/react zod zustand @tanstack/react-query
   npm install pg node-pg-migrate next-auth
   npm install class-variance-authority clsx tailwind-merge lucide-react
   npm install -D @types/pg
   ```

2. **Initialize shadcn/ui**
   ```bash
   npx shadcn@latest init
   npx shadcn@latest add button card input textarea badge avatar dropdown-menu dialog tabs toast scroll-area separator sheet table select command popover
   ```

3. **Create `.env.example`** with all required env vars:
   ```
   DATABASE_URL=postgresql://user:password@localhost:5432/vpo
   NEXTAUTH_URL=http://localhost:3000
   NEXTAUTH_SECRET=
   ANTHROPIC_API_KEY=
   GITHUB_CLIENT_ID=
   GITHUB_CLIENT_SECRET=
   ```

4. **Set up database connection** — `lib/db/pool.ts`
   - Create singleton `Pool` instance from `pg`
   - Export typed `query()` helper with parameterized query support
   - Add connection error handling

5. **Configure node-pg-migrate** — add to `package.json`:
   ```json
   {
     "scripts": {
       "migrate": "node-pg-migrate",
       "migrate:up": "node-pg-migrate up",
       "migrate:down": "node-pg-migrate down",
       "migrate:create": "node-pg-migrate create"
     }
   }
   ```

6. **Create directory structure:**
   ```
   lib/db/pool.ts
   lib/db/queries/
   lib/agents/
   lib/agents/prompts/
   lib/agents/tools/
   lib/auth/
   lib/types/
   lib/utils/
   components/ui/          (shadcn)
   components/chat/
   components/requests/
   components/review/
   components/layout/
   hooks/
   config/
   migrations/
   ```

7. **Set up base layout** — update `app/layout.tsx` with providers (QueryClient, session)

8. **Add `lib/utils/cn.ts`** — Tailwind merge utility for shadcn

9. **Create PR**, merge to main

### Verification
- [ ] `npm run dev` starts without errors
- [ ] `npm run build` succeeds
- [ ] `npm run lint` passes
- [ ] Database connection works (test query)
- [ ] shadcn components render correctly

---

## Session 2: Database Schema & Queries

**Branch:** `feature/database-schema`
**PR title:** "Add database schema migrations and typed query functions"

### Tasks

1. **Create migrations** (in order):

   **Migration 1: `create-extensions`**
   ```sql
   CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
   CREATE EXTENSION IF NOT EXISTS "pgcrypto";
   ```

   **Migration 2: `create-organizations-and-users`**
   ```sql
   CREATE TABLE organizations (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     name TEXT NOT NULL,
     slug TEXT UNIQUE NOT NULL,
     settings JSONB DEFAULT '{}',
     created_at TIMESTAMPTZ DEFAULT NOW(),
     updated_at TIMESTAMPTZ DEFAULT NOW()
   );

   CREATE TABLE users (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     email TEXT UNIQUE NOT NULL,
     name TEXT,
     avatar_url TEXT,
     created_at TIMESTAMPTZ DEFAULT NOW(),
     updated_at TIMESTAMPTZ DEFAULT NOW()
   );

   CREATE TABLE organization_users (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
     user_id UUID REFERENCES users(id) ON DELETE CASCADE,
     role TEXT NOT NULL DEFAULT 'STAKEHOLDER' CHECK (role IN ('STAKEHOLDER', 'REVIEWER', 'ADMIN')),
     created_at TIMESTAMPTZ DEFAULT NOW(),
     UNIQUE(organization_id, user_id)
   );
   ```

   **Migration 3: `create-feature-requests`**
   ```sql
   CREATE TABLE feature_requests (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
     requester_id UUID REFERENCES users(id),
     assignee_id UUID REFERENCES users(id),
     title TEXT NOT NULL,
     summary TEXT,
     status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN (
       'DRAFT', 'INTAKE_IN_PROGRESS', 'PENDING_ASSESSMENT',
       'UNDER_REVIEW', 'NEEDS_INFO', 'APPROVED', 'REJECTED',
       'DEFERRED', 'IN_BACKLOG', 'IN_PROGRESS', 'COMPLETED'
     )),
     intake_data JSONB DEFAULT '{}',
     intake_complete BOOLEAN DEFAULT FALSE,
     quality_score REAL,
     assessment_data JSONB,
     business_score REAL,
     technical_score REAL,
     risk_score REAL,
     priority_score REAL,
     complexity TEXT CHECK (complexity IN ('XS', 'S', 'M', 'L', 'XL', 'UNKNOWN')),
     tags TEXT[] DEFAULT '{}',
     external_id TEXT,
     external_url TEXT,
     created_at TIMESTAMPTZ DEFAULT NOW(),
     updated_at TIMESTAMPTZ DEFAULT NOW()
   );

   CREATE INDEX idx_feature_requests_org ON feature_requests(organization_id);
   CREATE INDEX idx_feature_requests_status ON feature_requests(status);
   CREATE INDEX idx_feature_requests_requester ON feature_requests(requester_id);
   ```

   **Migration 4: `create-conversations-and-messages`**
   ```sql
   CREATE TABLE conversations (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     request_id UUID REFERENCES feature_requests(id) ON DELETE CASCADE,
     agent_type TEXT NOT NULL CHECK (agent_type IN ('INTAKE', 'ASSESSMENT', 'OUTPUT', 'GENERAL')),
     status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'COMPLETED', 'ABANDONED')),
     created_at TIMESTAMPTZ DEFAULT NOW(),
     updated_at TIMESTAMPTZ DEFAULT NOW(),
     completed_at TIMESTAMPTZ
   );

   CREATE TABLE messages (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
     role TEXT NOT NULL CHECK (role IN ('USER', 'ASSISTANT', 'SYSTEM', 'TOOL')),
     content TEXT NOT NULL,
     tool_calls JSONB,
     tool_results JSONB,
     created_at TIMESTAMPTZ DEFAULT NOW()
   );

   CREATE INDEX idx_messages_conversation ON messages(conversation_id);
   ```

   **Migration 5: `create-epics-and-stories`**
   ```sql
   CREATE TABLE epics (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     request_id UUID UNIQUE REFERENCES feature_requests(id) ON DELETE CASCADE,
     title TEXT NOT NULL,
     description TEXT,
     goals TEXT[] DEFAULT '{}',
     success_criteria TEXT[] DEFAULT '{}',
     technical_notes TEXT,
     created_at TIMESTAMPTZ DEFAULT NOW(),
     updated_at TIMESTAMPTZ DEFAULT NOW()
   );

   CREATE TABLE user_stories (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     epic_id UUID REFERENCES epics(id) ON DELETE CASCADE,
     title TEXT NOT NULL,
     as_a TEXT NOT NULL,
     i_want TEXT NOT NULL,
     so_that TEXT NOT NULL,
     acceptance_criteria TEXT[] DEFAULT '{}',
     technical_notes TEXT,
     priority INT DEFAULT 0,
     story_points INT,
     created_at TIMESTAMPTZ DEFAULT NOW(),
     updated_at TIMESTAMPTZ DEFAULT NOW()
   );
   ```

   **Migration 6: `create-collaboration-tables`**
   ```sql
   CREATE TABLE comments (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     request_id UUID REFERENCES feature_requests(id) ON DELETE CASCADE,
     author_id UUID REFERENCES users(id),
     content TEXT NOT NULL,
     parent_id UUID REFERENCES comments(id),
     created_at TIMESTAMPTZ DEFAULT NOW(),
     updated_at TIMESTAMPTZ DEFAULT NOW()
   );

   CREATE TABLE decisions (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     request_id UUID REFERENCES feature_requests(id) ON DELETE CASCADE,
     user_id UUID REFERENCES users(id),
     decision TEXT NOT NULL CHECK (decision IN ('APPROVE', 'REJECT', 'DEFER', 'REQUEST_INFO')),
     rationale TEXT NOT NULL,
     created_at TIMESTAMPTZ DEFAULT NOW()
   );

   CREATE TABLE attachments (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     request_id UUID REFERENCES feature_requests(id) ON DELETE CASCADE,
     filename TEXT NOT NULL,
     mime_type TEXT NOT NULL,
     size INT NOT NULL,
     url TEXT NOT NULL,
     created_at TIMESTAMPTZ DEFAULT NOW()
   );
   ```

   **Migration 7: `create-configuration-tables`**
   ```sql
   CREATE TABLE priority_configs (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
     name TEXT NOT NULL,
     framework TEXT NOT NULL,
     weights JSONB NOT NULL,
     is_default BOOLEAN DEFAULT FALSE,
     created_at TIMESTAMPTZ DEFAULT NOW(),
     updated_at TIMESTAMPTZ DEFAULT NOW()
   );

   CREATE TABLE integrations (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
     type TEXT NOT NULL CHECK (type IN ('JIRA', 'LINEAR', 'GITHUB', 'SLACK', 'TEAMS', 'NOTION', 'CONFLUENCE')),
     name TEXT NOT NULL,
     config JSONB NOT NULL,
     is_active BOOLEAN DEFAULT TRUE,
     created_at TIMESTAMPTZ DEFAULT NOW(),
     updated_at TIMESTAMPTZ DEFAULT NOW()
   );
   ```

2. **Create TypeScript types** — `lib/types/database.ts`
   - Interfaces for all tables (camelCase)
   - Enum-like const objects for status values
   - Row-to-model mapping utility

3. **Create typed query functions:**
   - `lib/db/queries/organizations.ts` — CRUD for organizations
   - `lib/db/queries/users.ts` — CRUD for users, org membership
   - `lib/db/queries/feature-requests.ts` — CRUD, status transitions, filtering
   - `lib/db/queries/conversations.ts` — create, get with messages, update status
   - `lib/db/queries/messages.ts` — create, list by conversation
   - `lib/db/queries/epics.ts` — CRUD for epics and stories
   - `lib/db/queries/comments.ts` — threaded comments
   - `lib/db/queries/decisions.ts` — decision recording

4. **Add `updated_at` trigger function** (migration):
   ```sql
   CREATE OR REPLACE FUNCTION update_updated_at()
   RETURNS TRIGGER AS $$
   BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
   $$ LANGUAGE plpgsql;
   ```
   Apply to all tables with `updated_at`.

5. **Run migrations, verify schema**

6. **Create PR**, merge to main

### Verification
- [ ] All migrations run cleanly (`npm run migrate:up`)
- [ ] Migrations are reversible (`npm run migrate:down` then `up` again)
- [ ] TypeScript types match database schema
- [ ] Query functions compile and work against test database
- [ ] All queries use parameterized placeholders (security review)

---

## Session 3: Authentication

**Branch:** `feature/auth`
**PR title:** "Add NextAuth authentication with OAuth and RBAC"

### Tasks

1. **Install and configure NextAuth v5** (App Router compatible)
   - `lib/auth/config.ts` — NextAuth configuration
   - `app/api/auth/[...nextauth]/route.ts` — auth API route
   - GitHub OAuth provider (primary)
   - Google OAuth provider (secondary)

2. **Auth adapter** — custom PostgreSQL adapter using `pg` (not Prisma adapter)
   - `lib/auth/adapter.ts` — implements NextAuth adapter interface
   - Stores sessions, accounts, users in our existing tables
   - Add `accounts` and `sessions` tables migration

3. **Session handling**
   - `lib/auth/session.ts` — `getSession()` helper for server components and API routes
   - Middleware for protecting routes — `middleware.ts`

4. **RBAC implementation**
   - `lib/auth/rbac.ts` — role checking utilities
   - `withAuth(requiredRole)` wrapper for API routes
   - `requireRole()` helper for server components

5. **Auth UI pages**
   - `app/(auth)/login/page.tsx` — login page with OAuth buttons
   - `app/(auth)/callback/page.tsx` — OAuth callback handling

6. **Organization management**
   - Auto-create default org on first sign-in (or join existing by email domain)
   - `app/api/organizations/route.ts` — org CRUD

7. **Create PR**, run code review and security review, merge to main

### Verification
- [ ] OAuth login flow works (GitHub)
- [ ] Session persists across page navigations
- [ ] Protected routes redirect to login
- [ ] API routes return 401 without valid session
- [ ] Role-based access works (STAKEHOLDER, REVIEWER, ADMIN)
- [ ] Security review: no token leaks, CSRF protection, secure cookies

---

## Session 4: Intake Agent

**Branch:** `feature/intake-agent`
**PR title:** "Add conversational intake agent with streaming chat UI"

### Tasks

1. **Agent system prompt** — `lib/agents/prompts/intake.ts`
   - Adapt from PRD prompt (content is still valid)
   - Ensure it works well with Claude Sonnet 4.5

2. **Agent tools** (Zod + Vercel AI SDK `tool()`):
   - `lib/agents/tools/intake-tools.ts`
   - `save_intake_progress` — saves section data to feature_request.intake_data
   - `check_quality_score` — calculates completeness score
   - `mark_intake_complete` — transitions status to PENDING_ASSESSMENT
   - `get_similar_requests` — finds similar past requests by keyword

3. **API route** — `app/api/agents/intake/message/route.ts`
   - Uses `streamText()` from Vercel AI SDK
   - Claude model via `@ai-sdk/anthropic`
   - Automatic tool-use loop with `stopWhen: stepCountIs(5)`
   - Returns `toUIMessageStreamResponse()`
   - Authenticates user, validates conversation ownership

4. **Chat UI components:**
   - `components/chat/ChatWindow.tsx` — main chat using `useChat()` hook
   - `components/chat/MessageBubble.tsx` — individual message display
   - `components/chat/TypingIndicator.tsx` — loading state
   - `components/chat/QualityIndicator.tsx` — shows intake completeness score

5. **New request page** — `app/(dashboard)/requests/new/page.tsx`
   - Creates FeatureRequest + Conversation on load
   - Renders ChatWindow with initial greeting message
   - Side panel showing progress/completeness

6. **Create PR**, run code review and security review, merge to main

### Verification
- [ ] Chat streams responses in real-time
- [ ] Agent asks follow-up questions naturally
- [ ] Tool calls execute correctly (data saves to DB)
- [ ] Quality score updates as information is gathered
- [ ] Intake completion transitions request status
- [ ] Chat handles errors gracefully
- [ ] Security: auth check on API route, input validation

---

## Session 5: Assessment Agent

**Branch:** `feature/assessment-agent`
**PR title:** "Add assessment agent with priority scoring engine"

### Tasks

1. **Assessment system prompt** — `lib/agents/prompts/assessment.ts`
   - Business value analysis (strategic alignment, revenue, customer value, market, risk)
   - Technical assessment (complexity, debt, architecture fit, reusability, maintainability)
   - RICE and WSJF framework calculations
   - Confidence level indicators

2. **Assessment tools:**
   - `lib/agents/tools/assessment-tools.ts`
   - `get_organization_context` — retrieves org settings and priorities
   - `get_current_backlog` — fetches existing backlog for comparison
   - `get_historical_estimates` — past estimate accuracy for calibration
   - `save_assessment` — saves scores, complexity, rationale to DB

3. **Scoring configuration** — `config/scoring.ts`
   - Default RICE framework config
   - Configurable weights (business: 0.4, technical: 0.3, risk: 0.3)
   - Priority thresholds (high: 75, medium: 50)

4. **API route** — `app/api/agents/assess/[requestId]/route.ts`
   - Triggers assessment on completed intake
   - Runs assessment agent with `streamText()`
   - Saves results to feature_request

5. **Assessment display component** — `components/requests/AssessmentView.tsx`
   - Score visualization (business, technical, risk)
   - Complexity badge
   - Priority recommendation with rationale
   - Risk factors list

6. **Create PR**, merge to main

### Verification
- [ ] Assessment runs on completed intakes
- [ ] Scores are calculated and saved correctly
- [ ] Assessment rationale is clear and actionable
- [ ] Historical comparison works when backlog exists
- [ ] RICE/WSJF calculations are correct

---

## Session 6: Output Agent

**Branch:** `feature/output-agent`
**PR title:** "Add output agent for epic and user story generation"

### Tasks

1. **Output system prompt** — `lib/agents/prompts/output.ts`
   - Epic structure (title, description, goals, success criteria, tech notes)
   - User story format (As a / I want / So that)
   - Acceptance criteria (Given/When/Then)
   - Story sizing guidelines based on complexity
   - INVEST quality checklist

2. **Output tools:**
   - `lib/agents/tools/output-tools.ts`
   - `save_epic` — creates epic record in DB
   - `save_user_story` — creates user story linked to epic
   - `get_assessment_data` — reads assessment results for context
   - `get_intake_data` — reads intake conversation data

3. **API route** — `app/api/agents/generate/[requestId]/route.ts`
   - Triggers generation after assessment
   - Creates epic and stories in DB
   - Streams progress to client

4. **Display components:**
   - `components/requests/EpicView.tsx` — epic display with goals and criteria
   - `components/requests/UserStoryCard.tsx` — story card with AC
   - `components/requests/StoryList.tsx` — sorted list of stories

5. **Editing support** — allow humans to edit generated epics/stories
   - Inline editing with save
   - Regenerate individual stories

6. **Create PR**, merge to main

### Verification
- [ ] Epic generated with all required sections
- [ ] Stories follow As a/I want/So that format
- [ ] Acceptance criteria use Given/When/Then
- [ ] Story count matches complexity sizing
- [ ] Stories meet INVEST criteria
- [ ] Edits persist correctly

---

## Session 7: Request Management UI

**Branch:** `feature/request-management`
**PR title:** "Add request list, detail view, and status workflow"

### Tasks

1. **Request list page** — `app/(dashboard)/requests/page.tsx`
   - Table/card view with sorting and filtering
   - Status badges (color-coded)
   - Priority badges
   - Search by title/requester
   - Filter by status, priority, assignee

2. **Request detail page** — `app/(dashboard)/requests/[id]/page.tsx`
   - Header: title, status badge, priority, assignee, dates
   - Tabs: Overview | Chat History | Assessment | Epic & Stories | Discussion
   - Action buttons based on current status (context-dependent)

3. **Status workflow engine** — `lib/utils/workflow.ts`
   - Valid status transitions map
   - `canTransition(from, to)` validation
   - `getAvailableActions(status, userRole)` for UI

4. **Shared components:**
   - `components/requests/StatusBadge.tsx`
   - `components/requests/PriorityBadge.tsx`
   - `components/requests/RequestCard.tsx`
   - `components/layout/DashboardLayout.tsx` — sidebar navigation
   - `components/layout/Sidebar.tsx`

5. **Dashboard layout** — `app/(dashboard)/layout.tsx`
   - Sidebar with navigation (Requests, Review, Backlog, Analytics, Settings)
   - Top bar with user menu and notifications
   - Responsive (collapsible sidebar on mobile)

6. **Create PR**, merge to main

### Verification
- [ ] Request list loads and displays correctly
- [ ] Filtering and sorting work
- [ ] Detail view shows all tabs
- [ ] Status transitions follow valid workflow
- [ ] Actions respect user roles
- [ ] Responsive on mobile

---

## Session 8: Review & Approval Workflow

**Branch:** `feature/review-workflow`
**PR title:** "Add review queue, decisions, and comment system"

### Tasks

1. **Review queue page** — `app/(dashboard)/review/page.tsx`
   - List of requests with status UNDER_REVIEW
   - Priority-sorted
   - Quick preview expandable
   - Bulk actions (approve/reject multiple)

2. **Decision UI** — `components/review/DecisionPanel.tsx`
   - Approve / Reject / Defer / Request Info buttons
   - Required rationale textarea
   - Decision history display

3. **Comment system:**
   - `components/review/CommentThread.tsx` — threaded comments
   - `components/review/CommentInput.tsx` — new comment form
   - `app/api/requests/[id]/comments/route.ts` — CRUD API
   - Support @mentions (future: send notifications)

4. **Review API routes:**
   - `app/api/review/queue/route.ts` — get review queue
   - `app/api/review/[requestId]/decision/route.ts` — submit decision
   - Decisions trigger status transitions

5. **Backlog page** — `app/(dashboard)/backlog/page.tsx`
   - Approved requests sorted by priority
   - Drag-and-drop reordering (optional)
   - Export to external tools (placeholder for integrations)

6. **Create PR**, merge to main

### Verification
- [ ] Review queue shows correct requests
- [ ] Decisions record rationale and change status
- [ ] Comments support threading
- [ ] Only REVIEWER and ADMIN roles can make decisions
- [ ] Backlog reflects approved items in priority order

---

## Session 9: Dashboard & Notifications

**Branch:** `feature/dashboard`
**PR title:** "Add analytics dashboard and notification system"

### Tasks

1. **Analytics dashboard** — `app/(dashboard)/analytics/page.tsx`
   - Request volume over time (chart)
   - Average time-to-decision
   - Status distribution pie chart
   - Priority distribution
   - Top requesters

2. **Analytics API** — `app/api/analytics/route.ts`
   - Aggregate queries on feature_requests
   - Time-series data for charts
   - Use a charting library (recharts or chart.js)

3. **In-app notifications:**
   - `lib/notifications/store.ts` — Zustand notification store
   - `components/layout/NotificationBell.tsx` — header notification icon
   - `components/layout/NotificationDropdown.tsx` — notification list
   - Notification triggers: status changes, comments, decisions, assignments

4. **Email notifications** (basic):
   - `lib/notifications/email.ts` — email sending utility
   - Use Resend or Nodemailer
   - Templates for: request submitted, status changed, decision made
   - User preference for email notifications

5. **Settings page** — `app/(dashboard)/settings/page.tsx`
   - Organization settings
   - Scoring framework configuration
   - Notification preferences
   - User management (admin only)

6. **Create PR**, merge to main

### Verification
- [ ] Dashboard charts render with real data
- [ ] In-app notifications appear on relevant actions
- [ ] Email delivery works
- [ ] Settings save and apply correctly

---

## Session 10: Polish & Testing

**Branch:** `feature/testing`
**PR title:** "Add comprehensive tests, error handling, and UX polish"

### Tasks

1. **Testing setup:**
   - Install Vitest + React Testing Library
   - Configure test database
   - Add `npm test` script

2. **Unit tests:**
   - Database query functions (all CRUD operations)
   - Status workflow transitions
   - Scoring calculations
   - Agent tool handlers (mock DB)

3. **Integration tests:**
   - API route tests (auth, intake message, assessment, generation)
   - Full agent workflow: intake → assessment → output

4. **Component tests:**
   - ChatWindow interaction
   - Review decision flow
   - Request filtering

5. **Error handling polish:**
   - `app/error.tsx` — global error boundary
   - `app/(dashboard)/requests/[id]/error.tsx` — request-specific errors
   - API route error responses (consistent format)
   - Agent error recovery (retry, fallback messages)

6. **UX polish:**
   - Loading states (`loading.tsx` at each route segment)
   - Empty states for lists
   - Keyboard shortcuts (Cmd+K for search)
   - Responsive design verification
   - Accessibility audit (ARIA labels, focus management)

7. **Final code review and security review**

8. **Create PR**, merge to main

### Verification
- [ ] All tests pass
- [ ] `npm run build` succeeds with no warnings
- [ ] No accessibility violations (axe)
- [ ] Works on mobile viewport
- [ ] Error states render correctly

---

## Phase 2 Sessions (11+): Intelligence & Context

These sessions build on the completed MVP.

### Session 11: Codebase Integration
**Branch:** `feature/codebase-integration`
- GitHub OAuth for repo access
- Repository connection UI
- Claude Agent SDK for autonomous code analysis (hybrid approach)
- Impact analysis tool for assessment agent

### Session 12: Historical Learning
**Branch:** `feature/historical-learning`
- Store decision outcomes
- Similar request matching (keyword + embedding similarity)
- Estimation calibration (predicted vs actual complexity)

### Session 13: Business Context
**Branch:** `feature/business-context`
- OKR/goal model and management UI
- Strategic alignment scoring against active OKRs
- Resource/capacity tracking

### Session 14: Advanced Analytics
**Branch:** `feature/advanced-analytics`
- Estimate accuracy tracking
- Stakeholder engagement metrics
- Time-to-decision trends
- Prediction confidence over time

---

## Phase 3 Sessions (15+): Integrations

### Session 15: Jira Integration
**Branch:** `feature/jira-integration`
- Jira OAuth flow
- Epic/story creation in Jira
- Bidirectional status sync
- Backlog import

### Session 16: Linear Integration
**Branch:** `feature/linear-integration`
- Linear OAuth flow
- Issue creation
- Project/cycle mapping
- Status sync

### Session 17: Slack Integration
**Branch:** `feature/slack-integration`
- Slack app setup
- Submit requests via Slack
- Notification delivery
- Approval workflows

### Session 18: Webhook & API
**Branch:** `feature/public-api`
- Public REST API for custom integrations
- Webhook events for status changes
- API key management
- Rate limiting

---

## PR Workflow (Every Session)

1. **Create feature branch** from `main`
2. **Develop** following CLAUDE.md principles
3. **Run code review** (using code-review-expert agent)
4. **Run security review** (using security-engineer agent)
5. **Create PR** with:
   - Summary of changes
   - Linear issue references
   - Test plan
6. **Merge to main** after review passes

---

## Session Handoff Protocol

At the end of each session:
1. Ensure all changes are committed and pushed
2. PR is created or merged
3. Update this plan — mark completed sessions, note any deviations
4. Update Linear issues — close completed, add notes
5. Note any blockers or decisions for next session

At the start of each session:
1. Read `CLAUDE.md` for project context
2. Read this `IMPLEMENTATION_PLAN.md` for current progress
3. Read `reference/AGENT_SDK_RESEARCH.md` for SDK patterns
4. Check Linear for current issue status
5. `git pull origin main` to get latest code
6. Create feature branch for the session's work

---

## Progress Tracking

- [ ] Session 1: Project infrastructure
- [ ] Session 2: Database schema & queries
- [ ] Session 3: Authentication
- [ ] Session 4: Intake Agent
- [ ] Session 5: Assessment Agent
- [ ] Session 6: Output Agent
- [ ] Session 7: Request management UI
- [ ] Session 8: Review & approval workflow
- [ ] Session 9: Dashboard & notifications
- [ ] Session 10: Polish & testing
- [ ] Session 11: Codebase integration
- [ ] Session 12: Historical learning
- [ ] Session 13: Business context
- [ ] Session 14: Advanced analytics
- [ ] Session 15: Jira integration
- [ ] Session 16: Linear integration
- [ ] Session 17: Slack integration
- [ ] Session 18: Webhook & public API
