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

  // Creation hands off to a stable workflow URL without starting an AI run.
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
