# Contributing to Virtual Product Owner

Thank you for your interest in contributing to VPO! This guide will help you get started.

## Getting Started

### Prerequisites

- **Node.js** 20+ and **npm**
- **PostgreSQL** 15+ running locally or via Docker
- **GitHub OAuth App** (for authentication)
- **Anthropic API Key** (for AI agents)

### Setup

```bash
# Clone the repository
git clone https://github.com/rkvalvaa/virtual-po.git
cd virtual-po

# Install dependencies
npm install

# Copy environment template and fill in your values
cp .env.example .env.local

# Run database migrations
npm run migrate:up

# Start the development server
npm run dev
```

The app will be available at `http://localhost:3000`.

## Development Workflow

### Branch Naming

- `feature/<short-description>` for new features
- `fix/<short-description>` for bug fixes
- `chore/<short-description>` for maintenance tasks

### Making Changes

1. Create a feature branch from `main`
2. Make your changes following the code conventions below
3. Run lint and type checks: `npm run lint && npx tsc --noEmit`
4. Run tests: `npm test`
5. Commit with a clear, descriptive message
6. Open a pull request against `main`

### Pull Request Guidelines

- Keep PRs focused — one feature or fix per PR
- Include a summary of what changed and why
- Add a test plan describing how to verify the changes
- Link any related issues

## Code Conventions

### TypeScript

- Strict mode is enabled — avoid `any` types
- Define interfaces for all data shapes
- Use path aliases (`@/lib/...`, `@/components/...`)

### React / Next.js

- **Server Components by default** — only add `"use client"` when needed
- **Server Actions** for mutations, not API routes (except external endpoints)
- Use `<Suspense>` boundaries and `loading.tsx` for progressive loading
- Import directly from source files — avoid barrel exports (`index.ts`)

### Database

- **Always use parameterized queries** (`$1, $2, ...`) — never string interpolation
- Keep SQL queries in `lib/db/queries/` as typed functions
- All schema changes go through `node-pg-migrate` migrations
- Use `snake_case` in SQL, `camelCase` in TypeScript

### Styling

- Tailwind CSS v4 with shadcn/ui components
- Follow existing component patterns in `components/ui/`
- Dark mode via CSS custom properties (automatic)

### Testing

- Colocate test files: `component.test.tsx` next to `component.tsx`
- Use descriptive test names: `it('should reject when user lacks REVIEWER role')`
- Unit tests for utilities and query functions
- Integration tests for API routes

## Project Structure

```
app/                  # Next.js App Router pages and API routes
  (auth)/             # Auth routes
  (dashboard)/        # Main app routes
  api/                # API route handlers
lib/                  # Shared libraries
  agents/             # AI agent prompts, tools, configuration
  db/                 # Database client, queries, connection pool
  auth/               # Auth utilities and RBAC
  api/                # Public API utilities (auth, rate limiting)
  types/              # TypeScript type definitions
components/           # React components
  ui/                 # shadcn/ui base components
  chat/               # Agent chat interface
  settings/           # Settings page components
config/               # App configuration
migrations/           # PostgreSQL migration files
```

## Need Help?

- Open a [GitHub Discussion](https://github.com/rkvalvaa/virtual-po/discussions) for questions
- Check existing [issues](https://github.com/rkvalvaa/virtual-po/issues) before filing new ones
- Review the [README](./README.md) for architecture overview
