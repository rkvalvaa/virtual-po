import crypto from "node:crypto"
import { expect, type Page } from "@playwright/test"
import { query } from "@/lib/db/pool"

/**
 * Sign in through the test-only credentials provider (see auth.ts).
 *
 * Posting straight to the Auth.js callback is fewer moving parts than driving
 * a form: the page's request context shares its cookie jar with the browser,
 * so the session cookie set by the callback is the one the page then uses.
 */
export async function loginAs(page: Page, email: string): Promise<void> {
  await signInAs(page, email)

  // Confirm the session cookie actually took: /requests is behind the proxy.
  await page.goto("/requests")
  await expect(
    page.getByRole("heading", { name: "Feature Requests" }),
  ).toBeVisible()
}

/** Set a session cookie for `email` without asserting where it may go. */
export async function signInAs(page: Page, email: string): Promise<void> {
  const request = page.context().request

  const csrfResponse = await request.get("/api/auth/csrf")
  const { csrfToken } = (await csrfResponse.json()) as { csrfToken: string }

  await request.post("/api/auth/callback/credentials", {
    form: {
      csrfToken,
      email,
      token: process.env.E2E_AUTH_TOKEN ?? "",
      callbackUrl: "/requests",
    },
  })
}

/**
 * A working client-portal sign-in link for `email`, without an inbox:
 * Auth.js stores sha256(token + AUTH_SECRET), so the test can mint one.
 */
export async function portalLink(email: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex")
  const hash = crypto.createHash("sha256").update(`${token}${process.env.AUTH_SECRET}`).digest("hex")
  await query(
    `INSERT INTO verification_tokens (identifier, token, expires) VALUES ($1, $2, NOW() + INTERVAL '15 minutes')`,
    [email, hash],
  )
  return `/api/auth/callback/resend?${new URLSearchParams({ callbackUrl: "/portal", token, email })}`
}
