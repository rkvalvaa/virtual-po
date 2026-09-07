import { expect, test } from "@playwright/test"
import { loginAs } from "./helpers/auth"
import { readSeed } from "./helpers/seed"

test("CSV export downloads from the requests list", async ({ page }) => {
  await loginAs(page, readSeed().stakeholderEmail)

  const [download, response] = await Promise.all([
    page.waitForEvent("download"),
    page.waitForResponse((r) => r.url().includes("/api/export/requests")),
    page.getByRole("button", { name: "Export CSV" }).click(),
  ])

  expect(download.suggestedFilename()).toMatch(/\.csv$/)
  expect(response.headers()["content-type"]).toContain("text/csv")
})
