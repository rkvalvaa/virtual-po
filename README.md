# Virtual Product Owner (VPO)

An AI-powered application that streamlines feature request intake, assessment, and prioritization. VPO addresses the common Product Owner bottleneck by providing intelligent intake forms, automated assessment, and structured output generation — while keeping humans in the loop for final decisions.

Built with **Next.js 16**, **TypeScript**, **PostgreSQL**, and the **Vercel AI SDK** with **Claude**.

## Features

### AI Agent Pipeline

Three specialized AI agents work in sequence to transform vague feature requests into structured, actionable output:

- **Intake Agent** — Conversational feature request gathering with quality scoring. Asks clarifying questions, extracts requirements, and ensures completeness.
- **Assessment Agent** — Business value, technical complexity, and risk analysis using RICE/WSJF frameworks. Produces priority scores with strategic alignment.
- **Output Agent** — Epic and user story generation with acceptance criteria, effort estimates, and implementation notes.

### Request Lifecycle

Requests flow through a structured pipeline: `DRAFT` → `INTAKE_IN_PROGRESS` → `PENDING_ASSESSMENT` → `UNDER_REVIEW` → `APPROVED/REJECTED/DEFERRED` → `IN_BACKLOG` → `IN_PROGRESS` → `COMPLETED`

### Review & Decision Workflow

- Review queue with filtering and bulk actions
- Decision recording with rationale
- Comment threads on requests
- Role-based access (Stakeholder, Reviewer, Admin)

### Analytics Dashboard

- Request volume and status trends
- Assessment accuracy tracking
- Engagement metrics
- Priority distribution and outcome analysis

### Integrations

| Integration | Capabilities |
|-------------|-------------|
| **Jira** | Push epics/stories, bidirectional sync, import issues |
| **Linear** | Create issues, project/cycle mapping, status sync |
| **GitHub Issues** | Create issues from requests, Projects v2 support, label mapping |
| **Slack** | Submit requests via slash commands, notifications, approval workflows |
| **Webhooks** | HMAC-signed event delivery for custom integrations |
| **Public API** | RESTful API with API key auth and rate limiting |

### Business Context

- OKR management with strategic alignment scoring
- Team capacity tracking per quarter
- Historical learning from past decisions
- Similar request detection

## Tech Stack

| Category | Technology |
|----------|-----------|
| Framework | Next.js 16 (App Router) with TypeScript (strict mode) |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Database | PostgreSQL with raw SQL (`pg` library) |
| Migrations | node-pg-migrate |
| AI | Vercel AI SDK v6 (`ai` + `@ai-sdk/anthropic`) |
| Auth | NextAuth.js v5 with GitHub/Google OAuth |
| State | Zustand (client) + React Query (server state) |
| Validation | Zod |
| Testing | Vitest + Testing Library |
| Linting | ESLint 9 (flat config) |

## Getting Started

### Prerequisites

- **Node.js** 20+
- **PostgreSQL** 15+
- **GitHub OAuth App** (for authentication)
- **Anthropic API Key** (for AI agents)

### Quick Start

```bash
# Clone the repository
git clone https://github.com/rkvalvaa/virtual-po.git
cd virtual-po

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your values (see Configuration below)

# Run database migrations
npm run migrate:up

# Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to access the application.

### Configuration

Copy `.env.example` to `.env.local` and configure:

**Required:**
- `DATABASE_URL` — PostgreSQL connection string
- `AUTH_SECRET` — Generate with `openssl rand -base64 32`
- `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` — GitHub OAuth app credentials
- `ANTHROPIC_API_KEY` — Anthropic API key for Claude

**Optional integrations** (configured via Settings UI):
- Jira, Linear, GitHub Issues — credentials entered through the settings page
- Slack — requires `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_SIGNING_SECRET`

See [.env.example](.env.example) for the full list of variables.

## Project Structure

```
app/                          # Next.js App Router
  (auth)/                     # Login and auth callback routes
  (dashboard)/                # Main application routes
    requests/                 # Feature request pages
    review/                   # Review queue
    backlog/                  # Backlog management
    analytics/                # Analytics dashboard
    settings/                 # Organization settings
  api/                        # API route handlers
    agents/                   # AI agent streaming endpoints
    v1/                       # Public REST API
lib/                          # Shared libraries
  agents/                     # Agent prompts, tools, configuration
  db/                         # Database pool, queries, mappers
  auth/                       # Session, RBAC, types
  api/                        # API key auth, rate limiting, webhooks
  github/                     # GitHub API client
  jira/                       # Jira API client
  linear/                     # Linear API client
  types/                      # TypeScript type definitions
components/                   # React components
  ui/                         # shadcn/ui base components
  chat/                       # Agent chat interface
  requests/                   # Feature request components
  review/                     # Review workflow components
  settings/                   # Integration settings components
  layout/                     # Layout components (sidebar, header)
config/                       # Scoring and workflow configuration
migrations/                   # PostgreSQL migration files (0001-0018)
reference/                    # Product documentation and plans
```

## Available Scripts

```bash
npm run dev          # Start development server
npm run build        # Production build
npm run start        # Start production server
npm run lint         # Run ESLint
npm run test         # Run tests with Vitest
npm run migrate:up   # Run pending database migrations
npm run migrate:down # Rollback last migration
```

## Public API

VPO exposes a RESTful API at `/api/v1/` for programmatic access. API keys are managed via Settings > API Keys.

```bash
# List feature requests
curl -H "Authorization: Bearer vpo_your_key_here" \
  https://your-app.com/api/v1/requests

# Create a feature request
curl -X POST -H "Authorization: Bearer vpo_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{"title": "Add dark mode", "summary": "Users want a dark theme"}' \
  https://your-app.com/api/v1/requests
```

Rate limiting: 100 requests/minute per organization. Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) are included in every response.

## Deployment

### Vercel (Recommended)

1. Push your repository to GitHub
2. Import the project in [Vercel](https://vercel.com)
3. Add environment variables in the Vercel dashboard
4. Set up a PostgreSQL database (Vercel Postgres, Neon, Supabase, etc.)
5. Deploy — migrations run automatically via the build step

### Self-Hosted

```bash
# Clone and install
git clone https://github.com/rkvalvaa/virtual-po.git
cd virtual-po && npm ci

# Configure environment
cp .env.example .env.local
# Edit .env.local with your values

# Build and migrate
npm run build
npm run migrate:up

# Start production server
npm run start
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code conventions, and pull request guidelines.

## Security

See [SECURITY.md](SECURITY.md) for reporting vulnerabilities and security best practices.

## License

[MIT](LICENSE)
