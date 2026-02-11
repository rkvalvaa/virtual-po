# Virtual Product Owner (VPO)

An AI-powered application that transforms vague feature requests into structured, prioritized epics and user stories. VPO streamlines the product intake and prioritization process through three specialized AI agents, keeping humans in the loop for final decisions while automating the heavy lifting of requirements gathering, assessment, and story generation.

## Features

- **Conversational intake** -- AI-guided feature request gathering with real-time quality scoring
- **Automated assessment** -- Business value, technical complexity, and risk analysis using RICE/WSJF frameworks
- **Epic and user story generation** -- INVEST-compliant stories with Given/When/Then acceptance criteria
- **Role-based review workflow** -- Stakeholder, Reviewer, and Admin roles with approval/rejection/deferral
- **Multi-tenant organization support** -- Isolated workspaces with per-organization configuration
- **Configurable scoring weights** -- Customize priority frameworks and scoring thresholds
- **Streaming AI responses** -- Real-time agent responses via Vercel AI SDK streaming

## Architecture

### Agent Pipeline

Feature requests flow through three specialized agents in sequence:

```
Stakeholder --> Intake Agent --> Assessment Agent --> Output Agent --> Review Queue --> Backlog
```

1. **Intake Agent** -- Conversational feature request gathering. Guides stakeholders through structured questions about the problem, solution, business justification, and success metrics. Produces a quality score indicating request completeness.

2. **Assessment Agent** -- Business value, technical complexity, and risk analysis. Scores requests on multiple dimensions and calculates priority using RICE or WSJF frameworks with configurable weights.

3. **Output Agent** -- Epic and user story generation. Produces well-structured epics with goals and success criteria, broken down into user stories with Given/When/Then acceptance criteria.

### Tech Stack

| Category       | Technology                                          |
|----------------|-----------------------------------------------------|
| Framework      | Next.js 16 (App Router) with TypeScript (strict)    |
| AI             | Vercel AI SDK v6 (`ai` + `@ai-sdk/anthropic`)       |
| Database       | PostgreSQL with raw SQL (`pg` library)               |
| Migrations     | node-pg-migrate                                      |
| Auth           | NextAuth.js v5 with OAuth (GitHub, Google)           |
| Styling        | Tailwind CSS v4 + shadcn/ui                          |
| State          | Zustand (client) + React Query (server state)        |
| Validation     | Zod                                                  |
| Testing        | Vitest + Testing Library                             |

### Project Structure

```
app/                        # Next.js App Router pages and API routes
  (auth)/                   # Auth routes (login, callback)
  (dashboard)/              # Main app routes
    requests/               # Feature request management
    review/                 # Review queue
    backlog/                # Approved items
    analytics/              # Dashboard and metrics
    settings/               # Configuration
  api/                      # API route handlers
    agents/                 # Agent streaming endpoints
    auth/                   # NextAuth.js routes
    organizations/          # Organization management
lib/                        # Shared libraries
  agents/                   # Agent integration (prompts, tools)
  db/                       # Database client, pool, queries
  auth/                     # Auth utilities
  types/                    # TypeScript type definitions
  utils/                    # Helper functions
components/                 # React components
  ui/                       # shadcn/ui base components
  chat/                     # Agent chat interface
  requests/                 # Feature request components
  review/                   # Review workflow components
  layout/                   # Layout components
hooks/                      # Custom React hooks
config/                     # App configuration (scoring, workflows)
migrations/                 # PostgreSQL migration files
reference/                  # Product documentation and plans
```

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 15+
- npm

### Environment Variables

Copy `.env.example` to `.env.local` and fill in the required values:

| Variable             | Required | Description                              |
|----------------------|----------|------------------------------------------|
| `DATABASE_URL`       | Yes      | PostgreSQL connection string              |
| `AUTH_SECRET`        | Yes      | NextAuth.js session encryption secret     |
| `AUTH_GITHUB_ID`     | No       | GitHub OAuth app client ID                |
| `AUTH_GITHUB_SECRET` | No       | GitHub OAuth app client secret            |
| `AUTH_GOOGLE_ID`     | No       | Google OAuth client ID                    |
| `AUTH_GOOGLE_SECRET` | No       | Google OAuth client secret                |
| `ANTHROPIC_API_KEY`  | Yes      | Anthropic API key for Claude              |
| `AUTH_TRUST_HOST`    | No       | Set to `true` for non-Vercel deployments  |

At least one OAuth provider (GitHub or Google) must be configured for authentication.

### Installation

```bash
git clone https://github.com/rkvalvaa/virtual-po.git
cd virtual-po
npm install
cp .env.example .env.local
# Edit .env.local with your values
npm run migrate:up
npm run dev
```

The application will be available at [http://localhost:3000](http://localhost:3000).

### Available Scripts

| Command              | Description                              |
|----------------------|------------------------------------------|
| `npm run dev`        | Start development server                 |
| `npm run build`      | Production build                         |
| `npm run start`      | Start production server                  |
| `npm run lint`       | Run ESLint                               |
| `npm run migrate:up` | Run database migrations                  |
| `npm run migrate:down` | Rollback last migration                |
| `npm run migrate:create` | Create a new migration file          |
| `npm run test`       | Run tests with Vitest                    |

## Request Lifecycle

Feature requests progress through the following statuses:

```
DRAFT
  --> INTAKE_IN_PROGRESS
    --> PENDING_ASSESSMENT
      --> UNDER_REVIEW
        --> APPROVED --> IN_BACKLOG --> IN_PROGRESS --> COMPLETED
        --> REJECTED
        --> DEFERRED
```

- **DRAFT** -- Initial state when a request is created
- **INTAKE_IN_PROGRESS** -- Stakeholder is in conversation with the Intake Agent
- **PENDING_ASSESSMENT** -- Intake complete, awaiting automated assessment
- **UNDER_REVIEW** -- Assessment complete, awaiting human reviewer decision
- **APPROVED / REJECTED / DEFERRED** -- Reviewer decision recorded with rationale
- **IN_BACKLOG** -- Approved and queued for development
- **IN_PROGRESS** -- Currently being implemented
- **COMPLETED** -- Development finished

## Database Schema

The database uses PostgreSQL with raw SQL migrations managed by node-pg-migrate. Core tables:

| Table                | Description                                         |
|----------------------|-----------------------------------------------------|
| `organizations`      | Multi-tenant workspaces                             |
| `users`              | User accounts (linked to OAuth providers)           |
| `organization_users` | Organization membership with roles                  |
| `feature_requests`   | Feature requests with intake/assessment data        |
| `conversations`      | AI agent conversation sessions                      |
| `messages`           | Individual messages within conversations            |
| `epics`              | Generated epics linked to feature requests          |
| `user_stories`       | User stories with acceptance criteria               |
| `comments`           | Threaded discussion on requests                     |
| `decisions`          | Review decisions with rationale                     |
| `attachments`        | File attachments on requests                        |
| `priority_configs`   | Configurable scoring frameworks per organization    |

Migration files are in the `migrations/` directory, numbered sequentially.

## API Routes

| Method | Endpoint                              | Description                        |
|--------|---------------------------------------|------------------------------------|
| POST   | `/api/agents/intake`                  | Intake agent streaming             |
| POST   | `/api/agents/assess/[requestId]`      | Assessment agent streaming         |
| POST   | `/api/agents/generate/[requestId]`    | Output agent streaming             |
| GET    | `/api/organizations`                  | List user organizations            |
| POST   | `/api/organizations`                  | Create organization                |
| *      | `/api/auth/*`                         | NextAuth.js authentication routes  |

## Contributing

1. Create a feature branch: `feature/<short-description>`, `fix/<short-description>`, or `chore/<short-description>`
2. Keep PRs focused -- one feature or fix per pull request
3. Include a summary, description of changes, and test plan in the PR description
4. Link relevant Linear issues in the PR description
5. Ensure `npm run lint` and `npm run build` pass before submitting

## License

This project is proprietary. All rights reserved.
