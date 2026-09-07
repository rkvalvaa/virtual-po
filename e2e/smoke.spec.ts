import { expect, test } from "@playwright/test"
import { loginAs } from "./helpers/auth"
import { readSeed } from "./helpers/seed"

test("landing page renders", async ({ page }) => {
  await page.goto("/")
  await expect(
    page.getByRole("heading", { name: "Virtual Product Owner", level: 1 }),
  ).toBeVisible()
})

test("unauthenticated /requests redirects to /login", async ({ page }) => {
  await page.goto("/requests")
  await expect(page).toHaveURL(/\/login$/)
  await expect(
    page.getByRole("button", { name: /continue with github/i }),
  ).toBeVisible()
})

test("theme toggle switches the class on <html>", async ({ page }) => {
  await loginAs(page, readSeed().stakeholderEmail)
  const html = page.locator("html")

  await page.getByRole("button", { name: "Toggle theme" }).click()
  await page.getByRole("menuitem", { name: "Dark" }).click()
  await expect(html).toHaveClass(/\bdark\b/)

  await page.getByRole("button", { name: "Toggle theme" }).click()
  await page.getByRole("menuitem", { name: "Light" }).click()
  await expect(html).not.toHaveClass(/\bdark\b/)
})
