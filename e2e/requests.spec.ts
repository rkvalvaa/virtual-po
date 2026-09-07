import { expect, test } from "@playwright/test"
import { loginAs } from "./helpers/auth"
import { readSeed } from "./helpers/seed"

test("stakeholder creates a request and opens its detail page", async ({
  page,
}) => {
  await loginAs(page, readSeed().stakeholderEmail)

  const title = `E2E created request ${Date.now()}`
  await page.goto("/requests/new")

  await page.getByLabel("Working title (optional)").fill(title)
  await page.getByRole("button", { name: /start from scratch/i }).click()

  // Creation hands off to the intake chat in place — it does not navigate to
  // /requests/[id]. The chat only calls the agent once a message is sent, so
  // stopping here keeps this slice free of LLM calls.
  await expect(
    page.getByRole("main").getByText("Intake Agent", { exact: true }),
  ).toBeVisible()

  await page.goto("/requests")
  await page.getByRole("link", { name: title }).click()

  await expect(page).toHaveURL(
    /\/requests\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
  )
  await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible()
})
