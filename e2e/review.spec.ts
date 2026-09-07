import { expect, test } from "@playwright/test"
import { loginAs } from "./helpers/auth"
import { readSeed } from "./helpers/seed"

test("reviewer approves a request from the review queue", async ({ page }) => {
  const seed = readSeed()
  await loginAs(page, seed.reviewerEmail)

  await page.goto("/review")
  await page.getByRole("link", { name: seed.reviewRequestTitle }).click()

  const header = page
    .getByRole("heading", { name: seed.reviewRequestTitle, level: 1 })
    .locator("..")
  await expect(header.getByText("Under Review")).toBeVisible()

  await page.getByRole("button", { name: "Approve", exact: true }).click()
  await page
    .getByPlaceholder("Explain the reason for this decision...")
    .fill("Clear business value and a small blast radius — approved.")
  await page.getByRole("button", { name: "Submit Decision" }).click()

  await expect(header.getByText("Approved")).toBeVisible()
})
