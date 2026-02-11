# Auth.js v5 (NextAuth v5) Research for VPO Project

> Researched 2026-02-10 | Next.js 16.1.6 | Target: JWT strategy with GitHub + Google OAuth

## Table of Contents

1. [Package & Version](#1-package--version)
2. [Project Setup](#2-project-setup)
3. [Core Configuration (auth.ts)](#3-core-configuration-authts)
4. [OAuth Providers (GitHub & Google)](#4-oauth-providers-github--google)
5. [Custom Database Adapter (raw pg)](#5-custom-database-adapter-raw-pg)
6. [Session Handling](#6-session-handling)
7. [Middleware / Route Protection](#7-middleware--route-protection)
8. [JWT vs Database Strategy](#8-jwt-vs-database-strategy)
9. [TypeScript Module Augmentation](#9-typescript-module-augmentation)
10. [Environment Variables](#10-environment-variables)
11. [Database Schema (official)](#11-database-schema-official)
12. [Implementation Plan](#12-implementation-plan)

---

## 1. Package & Version

**Package name:** `next-auth` (still the package name for Next.js integration)

```bash
npm install next-auth@beta
```

As of early 2026, v5 is still published under the `@beta` tag on npm. The package name remains `next-auth` for the Next.js framework binding, but the core library is `@auth/core`.

**Key packages:**
- `next-auth@beta` - Next.js integration (re-exports from @auth/core)
- `@auth/core` - Framework-agnostic core (installed as dependency of next-auth)
- `@auth/pg-adapter` - Official PostgreSQL adapter (we will write a custom one instead)

**Important:** Our project currently has `"next-auth": "^4.24.13"` in package.json. This needs to be replaced with `next-auth@beta`.

**Minimum requirements:** Next.js 14.0+ (we have 16.1.6, so we are good).

---

## 2. Project Setup

### File Structure

```
D:\dev\virtual-po\
  auth.ts                          # Main auth config (root level)
  auth.config.ts                   # Edge-compatible config subset (optional)
  proxy.ts                         # Next.js 16 middleware (was middleware.ts)
  app/
    api/
      auth/
        [...nextauth]/
          route.ts                 # Route handler
    (dashboard)/
      layout.tsx                   # Protected layout
  lib/
    auth/
      adapter.ts                   # Custom pg adapter
      types.ts                     # Module augmentation
```

### Installation

```bash
npm install next-auth@beta
# We already have pg@^8.18.0 installed - no need for @auth/pg-adapter
```

### Route Handler

Create `app/api/auth/[...nextauth]/route.ts`:

```typescript
import { handlers } from "@/auth"
export const { GET, POST } = handlers
```

This exposes the following endpoints automatically:
- `GET /api/auth/signin` - Sign-in page
- `GET /api/auth/signout` - Sign-out page
- `GET /api/auth/session` - Session JSON
- `POST /api/auth/signin/:provider` - Initiate OAuth
- `POST /api/auth/signout` - Process sign-out
- `GET /api/auth/callback/:provider` - OAuth callback
- `GET /api/auth/csrf` - CSRF token
- `GET /api/auth/providers` - List providers

---

## 3. Core Configuration (auth.ts)

### Basic Pattern

```typescript
// auth.ts (project root)
import NextAuth from "next-auth"
import GitHub from "next-auth/providers/github"
import Google from "next-auth/providers/google"
import { PgAdapter } from "@/lib/auth/adapter"
import { pool } from "@/lib/db"

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PgAdapter(pool),
  session: { strategy: "jwt" },
  providers: [GitHub, Google],
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    async jwt({ token, user, account }) {
      // Called when JWT is created (sign-in) or updated (session access)
      if (user) {
        // First sign-in: add user data to token
        token.id = user.id
        token.role = user.role
        token.orgId = user.orgId
      }
      return token
    },
    async session({ session, token }) {
      // Called whenever session is checked
      // Forward JWT fields to the client-visible session
      if (token) {
        session.user.id = token.id as string
        session.user.role = token.role as string
        session.user.orgId = token.orgId as string
      }
      return session
    },
    async signIn({ user, account, profile }) {
      // Return true to allow sign-in, false to deny
      // Could check if email domain is allowed, etc.
      return true
    },
    authorized: async ({ auth }) => {
      // Used by proxy.ts (middleware) to check auth
      return !!auth
    },
  },
})
```

### Key Exports

| Export      | Purpose                                       |
|-------------|-----------------------------------------------|
| `handlers`  | `{ GET, POST }` for the route handler         |
| `auth`      | Universal session getter (server components, middleware, API routes) |
| `signIn`    | Server Action to initiate sign-in             |
| `signOut`   | Server Action to initiate sign-out            |

---

## 4. OAuth Providers (GitHub & Google)

### Auto-inference (Simplest)

Auth.js v5 auto-infers environment variables prefixed with `AUTH_`:

```typescript
import GitHub from "next-auth/providers/github"
import Google from "next-auth/providers/google"

// These automatically read AUTH_GITHUB_ID, AUTH_GITHUB_SECRET, etc.
providers: [GitHub, Google]
```

With env vars:
```env
AUTH_GITHUB_ID=your-github-client-id
AUTH_GITHUB_SECRET=your-github-client-secret
AUTH_GOOGLE_ID=your-google-client-id
AUTH_GOOGLE_SECRET=your-google-client-secret
```

### Explicit Configuration (if needed)

```typescript
providers: [
  GitHub({
    clientId: process.env.AUTH_GITHUB_ID,
    clientSecret: process.env.AUTH_GITHUB_SECRET,
    // Optional: customize the profile data
    profile(profile) {
      return {
        id: profile.id.toString(),
        name: profile.name || profile.login,
        email: profile.email,
        image: profile.avatar_url,
        role: "member", // default role for new users
      }
    },
  }),
  Google({
    clientId: process.env.AUTH_GOOGLE_ID,
    clientSecret: process.env.AUTH_GOOGLE_SECRET,
    profile(profile) {
      return {
        id: profile.sub,
        name: profile.name,
        email: profile.email,
        image: profile.picture,
        role: "member",
      }
    },
  }),
]
```

### OAuth Callback URLs

Configure these in the provider dashboards:
- **GitHub:** `https://your-domain.com/api/auth/callback/github`
- **Google:** `https://your-domain.com/api/auth/callback/google`
- **Dev:** `http://localhost:3000/api/auth/callback/github` (and `/google`)

---

## 5. Custom Database Adapter (raw pg)

Since we use raw `pg` (not Prisma/Drizzle), we need a custom adapter. The adapter is only used for **persisting users and accounts** -- with JWT strategy, we do NOT need session table methods.

### Adapter Interface

```typescript
import type { Adapter, AdapterUser, AdapterAccount } from "@auth/core/adapters"
```

### Required Methods for JWT Strategy

When using `session: { strategy: "jwt" }`, Auth.js only needs these adapter methods:

| Method                | When Called                              | Required? |
|-----------------------|-----------------------------------------|-----------|
| `createUser(user)`    | First OAuth sign-in (new user)          | YES       |
| `getUser(id)`         | Fetching user by ID                     | YES       |
| `getUserByEmail(email)` | Checking if user exists before create | YES       |
| `getUserByAccount({provider, providerAccountId})` | Checking if OAuth account is linked | YES |
| `updateUser(user)`    | Updating user profile                   | YES       |
| `linkAccount(account)` | Linking OAuth provider to user         | YES       |
| `deleteUser(userId)`  | NOT currently invoked by Auth.js        | Optional  |
| `unlinkAccount()`     | NOT currently invoked by Auth.js        | Optional  |
| `createSession()`     | Only for database strategy              | NO (JWT)  |
| `getSessionAndUser()` | Only for database strategy              | NO (JWT)  |
| `updateSession()`     | Only for database strategy              | NO (JWT)  |
| `deleteSession()`     | Only for database strategy              | NO (JWT)  |

### Complete Custom Adapter Implementation

```typescript
// lib/auth/adapter.ts
import type { Adapter, AdapterUser, AdapterAccount } from "@auth/core/adapters"
import type { Pool } from "pg"

export function PgAdapter(pool: Pool): Adapter {
  return {
    async createUser(user) {
      const sql = `
        INSERT INTO users (name, email, email_verified, image)
        VALUES ($1, $2, $3, $4)
        RETURNING id, name, email, email_verified AS "emailVerified", image
      `
      const result = await pool.query(sql, [
        user.name,
        user.email,
        user.emailVerified,
        user.image,
      ])
      return result.rows[0] as AdapterUser
    },

    async getUser(id) {
      const sql = `
        SELECT id, name, email, email_verified AS "emailVerified", image
        FROM users WHERE id = $1
      `
      const result = await pool.query(sql, [id])
      return (result.rows[0] as AdapterUser) ?? null
    },

    async getUserByEmail(email) {
      const sql = `
        SELECT id, name, email, email_verified AS "emailVerified", image
        FROM users WHERE email = $1
      `
      const result = await pool.query(sql, [email])
      return (result.rows[0] as AdapterUser) ?? null
    },

    async getUserByAccount({ providerAccountId, provider }) {
      const sql = `
        SELECT u.id, u.name, u.email, u.email_verified AS "emailVerified", u.image
        FROM users u
        JOIN accounts a ON u.id = a.user_id
        WHERE a.provider = $1 AND a.provider_account_id = $2
      `
      const result = await pool.query(sql, [provider, providerAccountId])
      return (result.rows[0] as AdapterUser) ?? null
    },

    async updateUser(user) {
      // Fetch current user, merge with updates
      const current = await pool.query(
        `SELECT id, name, email, email_verified AS "emailVerified", image FROM users WHERE id = $1`,
        [user.id]
      )
      const existing = current.rows[0]
      const merged = { ...existing, ...user }

      const sql = `
        UPDATE users
        SET name = $1, email = $2, email_verified = $3, image = $4
        WHERE id = $5
        RETURNING id, name, email, email_verified AS "emailVerified", image
      `
      const result = await pool.query(sql, [
        merged.name,
        merged.email,
        merged.emailVerified,
        merged.image,
        merged.id,
      ])
      return result.rows[0] as AdapterUser
    },

    async linkAccount(account) {
      const sql = `
        INSERT INTO accounts (
          user_id, type, provider, provider_account_id,
          refresh_token, access_token, expires_at,
          id_token, scope, session_state, token_type
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `
      await pool.query(sql, [
        account.userId,
        account.type,
        account.provider,
        account.providerAccountId,
        account.refresh_token ?? null,
        account.access_token ?? null,
        account.expires_at ?? null,
        account.id_token ?? null,
        account.scope ?? null,
        account.session_state ?? null,
        account.token_type ?? null,
      ])
      return account as AdapterAccount
    },

    async unlinkAccount({ providerAccountId, provider }) {
      const sql = `
        DELETE FROM accounts
        WHERE provider = $1 AND provider_account_id = $2
      `
      await pool.query(sql, [provider, providerAccountId])
    },

    async deleteUser(userId) {
      await pool.query(`DELETE FROM accounts WHERE user_id = $1`, [userId])
      await pool.query(`DELETE FROM users WHERE id = $1`, [userId])
    },
  }
}
```

### Key Implementation Notes

1. **Column aliasing:** PostgreSQL uses `snake_case` columns, but Auth.js expects `camelCase`. Use `AS "emailVerified"` in SELECT queries.
2. **Parameterized queries:** Always use `$1, $2, ...` placeholders to prevent SQL injection.
3. **Return types:** `createUser` and `updateUser` MUST return the user object. `linkAccount` returns the account or void.
4. **Null handling:** OAuth tokens may be null/undefined -- always coalesce with `?? null`.

---

## 6. Session Handling

### In Server Components

```typescript
import { auth } from "@/auth"

export default async function DashboardPage() {
  const session = await auth()

  if (!session) {
    redirect("/login")
  }

  return (
    <div>
      <p>Welcome, {session.user.name}</p>
      <p>Role: {session.user.role}</p>
      <p>Org: {session.user.orgId}</p>
    </div>
  )
}
```

### In API Routes (App Router)

**Pattern 1: Direct call**

```typescript
import { auth } from "@/auth"
import { NextResponse } from "next/server"

export async function GET() {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return NextResponse.json({ user: session.user })
}
```

**Pattern 2: Wrapper (gives req.auth)**

```typescript
import { auth } from "@/auth"
import { NextResponse } from "next/server"

export const GET = auth(function GET(req) {
  if (!req.auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  return NextResponse.json({ user: req.auth.user })
})
```

### In Client Components

```typescript
"use client"
import { useSession } from "next-auth/react"

export function UserMenu() {
  const { data: session, status } = useSession()

  if (status === "loading") return <div>Loading...</div>
  if (!session) return <SignInButton />

  return <div>{session.user.name}</div>
}
```

**Important:** Client components need the `SessionProvider` wrapper:

```typescript
// app/providers.tsx
"use client"
import { SessionProvider } from "next-auth/react"

export function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>
}

// app/layout.tsx
import { Providers } from "./providers"

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
```

---

## 7. Middleware / Route Protection

### Next.js 16: proxy.ts (was middleware.ts)

In Next.js 16, the middleware file is renamed to `proxy.ts` and exports `proxy` instead of `middleware`.

**Simple pattern (redirect unauthenticated users):**

```typescript
// proxy.ts (project root)
export { auth as proxy } from "@/auth"
```

This works with the `authorized` callback in auth.ts:

```typescript
// in auth.ts callbacks:
authorized: async ({ auth }) => {
  return !!auth  // true = allowed, false = redirect to signIn page
}
```

**Advanced pattern (custom redirect logic):**

```typescript
// proxy.ts
import { auth } from "@/auth"

export const proxy = auth((req) => {
  const isLoggedIn = !!req.auth
  const isOnDashboard = req.nextUrl.pathname.startsWith("/(dashboard)")
  const isOnLogin = req.nextUrl.pathname === "/login"
  const isAuthRoute = req.nextUrl.pathname.startsWith("/api/auth")

  // Always allow auth API routes
  if (isAuthRoute) return

  // Redirect unauthenticated users to login
  if (!isLoggedIn && isOnDashboard) {
    return Response.redirect(new URL("/login", req.nextUrl.origin))
  }

  // Redirect logged-in users away from login page
  if (isLoggedIn && isOnLogin) {
    return Response.redirect(new URL("/", req.nextUrl.origin))
  }
})

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
}
```

### Edge Compatibility Note

If the adapter uses Node.js-only APIs (like `pg`), split the config:

**auth.config.ts** (edge-safe, no adapter):

```typescript
import GitHub from "next-auth/providers/github"
import Google from "next-auth/providers/google"
import type { NextAuthConfig } from "next-auth"

export default {
  providers: [GitHub, Google],
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    authorized: async ({ auth }) => {
      return !!auth
    },
  },
} satisfies NextAuthConfig
```

**auth.ts** (full config with adapter):

```typescript
import NextAuth from "next-auth"
import { PgAdapter } from "@/lib/auth/adapter"
import { pool } from "@/lib/db"
import authConfig from "./auth.config"

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PgAdapter(pool),
  session: { strategy: "jwt" },
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = user.role
        token.orgId = user.orgId
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string
        session.user.role = token.role as string
        session.user.orgId = token.orgId as string
      }
      return session
    },
  },
})
```

**proxy.ts** (uses edge-safe config):

```typescript
import NextAuth from "next-auth"
import authConfig from "./auth.config"

const { auth } = NextAuth(authConfig)
export const proxy = auth((req) => {
  // middleware logic
})

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
}
```

---

## 8. JWT vs Database Strategy

### We want JWT. Here is why:

| Aspect          | JWT (`"jwt"`)                       | Database (`"database"`)           |
|-----------------|-------------------------------------|-----------------------------------|
| Storage         | Encrypted cookie (JWE)              | Database row + session cookie     |
| Performance     | ~8-10ms (no DB call)                | ~50-100ms (DB lookup per request) |
| Scaling         | Stateless, infinite horizontal      | Needs shared DB                   |
| Invalidation    | Cannot revoke (until expiry)        | Can delete from DB                |
| Complexity      | Simpler (no session table needed)   | Needs session CRUD methods        |
| Adapter methods | Only user + account methods         | All methods including session     |

### JWT Configuration

```typescript
session: {
  strategy: "jwt",
  maxAge: 30 * 24 * 60 * 60, // 30 days
},
```

### JWT Callback Flow

1. **Sign-in:** `jwt({ token, user, account, profile })` -- `user` is populated
2. **Subsequent requests:** `jwt({ token })` -- only `token` is available
3. **Session access:** `session({ session, token })` -- forward token data to session

### Custom Fields in JWT

```typescript
callbacks: {
  async jwt({ token, user, account }) {
    if (user) {
      // This runs only on sign-in
      // Query DB for additional user data
      token.id = user.id
      token.role = user.role       // from custom user table column
      token.orgId = user.orgId     // from custom user table column
    }
    return token
  },
  async session({ session, token }) {
    // This runs on every session check
    session.user.id = token.id as string
    session.user.role = token.role as string
    session.user.orgId = token.orgId as string
    return session
  },
}
```

---

## 9. TypeScript Module Augmentation

Create a types file to extend Auth.js types with our custom fields:

```typescript
// lib/auth/types.ts  (or types/next-auth.d.ts)
import { DefaultSession, DefaultUser } from "next-auth"
import { DefaultJWT } from "next-auth/jwt"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: string
      orgId: string
    } & DefaultSession["user"]
  }

  interface User extends DefaultUser {
    role: string
    orgId: string
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id: string
    role: string
    orgId: string
  }
}
```

Make sure this file is included in `tsconfig.json` (it will be if it's under `src/` or in a `types/` directory referenced by `include`).

---

## 10. Environment Variables

### Required

```env
# Auth.js core
AUTH_SECRET=generate-with-openssl-rand-base64-32

# GitHub OAuth App
AUTH_GITHUB_ID=your-github-oauth-app-client-id
AUTH_GITHUB_SECRET=your-github-oauth-app-client-secret

# Google OAuth
AUTH_GOOGLE_ID=your-google-oauth-client-id
AUTH_GOOGLE_SECRET=your-google-oauth-client-secret

# Trust host (needed behind proxies, or in production)
AUTH_TRUST_HOST=true
```

### Generating AUTH_SECRET

```bash
npx auth secret
# or
openssl rand -base64 32
```

### Cookie Changes from v4

Cookies are now prefixed with `authjs.` instead of `next-auth.`. The cookie name is `authjs.session-token` (not `next-auth.session-token`).

---

## 11. Database Schema (official)

The official `@auth/pg-adapter` expects this schema. We will use UUIDs and `snake_case` with our custom adapter:

### Official Schema (for reference)

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255),
  email VARCHAR(255) UNIQUE,
  "emailVerified" TIMESTAMPTZ,
  image TEXT
);

CREATE TABLE accounts (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  type VARCHAR(255) NOT NULL,
  provider VARCHAR(255) NOT NULL,
  "providerAccountId" VARCHAR(255) NOT NULL,
  refresh_token TEXT,
  access_token TEXT,
  expires_at BIGINT,
  id_token TEXT,
  scope TEXT,
  session_state TEXT,
  token_type TEXT
);

CREATE TABLE sessions (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  expires TIMESTAMPTZ NOT NULL,
  "sessionToken" VARCHAR(255) NOT NULL
);

CREATE TABLE verification_token (
  identifier TEXT NOT NULL,
  expires TIMESTAMPTZ NOT NULL,
  token TEXT NOT NULL,
  PRIMARY KEY (identifier, token)
);
```

### Our Adapted Schema (snake_case, UUIDs, extra columns)

We use `snake_case` columns in PostgreSQL and alias them in SQL queries. We also add custom columns for our RBAC needs.

```sql
-- Users table with RBAC fields
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255),
  email VARCHAR(255) UNIQUE NOT NULL,
  email_verified TIMESTAMPTZ,
  image TEXT,
  role VARCHAR(50) NOT NULL DEFAULT 'member',
  org_id UUID REFERENCES organizations(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- OAuth accounts linked to users
CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(255) NOT NULL,
  provider VARCHAR(255) NOT NULL,
  provider_account_id VARCHAR(255) NOT NULL,
  refresh_token TEXT,
  access_token TEXT,
  expires_at BIGINT,
  id_token TEXT,
  scope TEXT,
  session_state TEXT,
  token_type TEXT,
  UNIQUE(provider, provider_account_id)
);

-- Not needed for JWT strategy, but included for completeness
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_token VARCHAR(255) UNIQUE NOT NULL,
  expires TIMESTAMPTZ NOT NULL
);

CREATE TABLE verification_token (
  identifier TEXT NOT NULL,
  token TEXT NOT NULL,
  expires TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (identifier, token)
);
```

---

## 12. Implementation Plan

### Files to Create/Modify

1. **`auth.config.ts`** - Edge-safe config (providers, pages, authorized callback)
2. **`auth.ts`** - Full config with adapter, JWT/session callbacks
3. **`proxy.ts`** - Next.js 16 middleware (import from auth.config.ts for edge compat)
4. **`app/api/auth/[...nextauth]/route.ts`** - Route handler
5. **`lib/auth/adapter.ts`** - Custom pg adapter
6. **`lib/auth/types.ts`** - Module augmentation for Session, User, JWT
7. **`app/login/page.tsx`** - Sign-in page with OAuth buttons
8. **`app/providers.tsx`** - SessionProvider wrapper (for client components)
9. **`.env.local`** - Environment variables

### Sign-in Flow

1. User clicks "Sign in with GitHub" button
2. Button triggers server action: `await signIn("github")`
3. Auth.js redirects to GitHub OAuth page
4. GitHub redirects back to `/api/auth/callback/github`
5. Auth.js calls adapter: `getUserByAccount()` to check if account exists
6. If new user: `createUser()` then `linkAccount()`
7. If existing user: fetches user data
8. JWT callback runs: adds `id`, `role`, `orgId` to token
9. Encrypted JWT stored in cookie
10. User redirected to dashboard

### Sign-in UI (Server Action Pattern)

```typescript
// app/login/page.tsx
import { signIn } from "@/auth"

export default function LoginPage() {
  return (
    <div>
      <h1>Sign in to VPO</h1>
      <form action={async () => {
        "use server"
        await signIn("github", { redirectTo: "/" })
      }}>
        <button type="submit">Sign in with GitHub</button>
      </form>
      <form action={async () => {
        "use server"
        await signIn("google", { redirectTo: "/" })
      }}>
        <button type="submit">Sign in with Google</button>
      </form>
    </div>
  )
}
```

### Sign-out Pattern

```typescript
import { signOut } from "@/auth"

export function SignOutButton() {
  return (
    <form action={async () => {
      "use server"
      await signOut({ redirectTo: "/login" })
    }}>
      <button type="submit">Sign out</button>
    </form>
  )
}
```

### Helper: requireAuth()

```typescript
// lib/auth/helpers.ts
import { auth } from "@/auth"
import { redirect } from "next/navigation"

export async function requireAuth() {
  const session = await auth()
  if (!session?.user) {
    redirect("/login")
  }
  return session
}

export async function requireRole(role: string) {
  const session = await requireAuth()
  if (session.user.role !== role && session.user.role !== "admin") {
    redirect("/unauthorized")
  }
  return session
}
```

---

## Sources

- [Auth.js Installation Guide](https://authjs.dev/getting-started/installation)
- [Auth.js Next.js Reference](https://authjs.dev/reference/nextjs)
- [Auth.js Migration Guide v4 to v5](https://authjs.dev/getting-started/migrating-to-v5)
- [Auth.js Adapter Interface](https://authjs.dev/reference/core/adapters)
- [Auth.js Creating a Database Adapter](https://authjs.dev/guides/creating-a-database-adapter)
- [Auth.js pg-adapter Reference](https://authjs.dev/reference/pg-adapter)
- [Auth.js Session Protection](https://authjs.dev/getting-started/session-management/protecting)
- [Auth.js TypeScript Guide](https://authjs.dev/getting-started/typescript)
- [Auth.js Extending Sessions](https://authjs.dev/guides/extending-the-session)
- [Auth.js Database Adapters](https://authjs.dev/getting-started/database)
