import { expect, test } from "@playwright/test"
import { loginAs } from "./helpers/auth"
import { readSeed } from "./helpers/seed"

test("stakeholder votes on a request and sees the summary update", async ({
  page,
}) => {
  const seed = readSeed()
  await loginAs(page, seed.stakeholderEmail)

  await page.goto(`/requests/${seed.voteRequestId}`)
  await expect(page.getByText("Stakeholder Votes")).toBeVisible()

  await page.getByRole("button", { name: "Rate 4 of 5" }).click()
  await page.getByRole("button", { name: "Submit Vote" }).click()

  await expect(page.getByText("4.0 avg (1 vote)")).toBeVisible()
})
