import { expect, type Page } from "@playwright/test"

/**
 * Sign in through the test-only credentials provider (see auth.ts).
 *
 * Posting straight to the Auth.js callback is fewer moving parts than driving
 * a form: the page's request context shares its cookie jar with the browser,
 * so the session cookie set by the callback is the one the page then uses.
 */
export async function loginAs(page: Page, email: string): Promise<void> {
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

  // Confirm the session cookie actually took: /requests is behind the proxy.
  await page.goto("/requests")
  await expect(
    page.getByRole("heading", { name: "Feature Requests" }),
  ).toBeVisible()
}
