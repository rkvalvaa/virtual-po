import { expect, test } from "@playwright/test"
import { loginAs } from "./helpers/auth"
import { readSeed } from "./helpers/seed"

test("stakeholder votes on a request and sees the summary update", async ({
  page,
}) => {
  const seed = readSeed()
  await loginAs(page, seed.stakeholderEmail)

  await page.goto(`/requests/${seed.voteRequestId}`)
  // Scoped to <main>: React's streaming SSR parks a second copy of the card in
  // a `<div hidden>` at the end of <body> until hydration relocates it, which
  // makes an unscoped getByText ambiguous on a cold page load.
  await expect(
    page.getByRole("main").getByText("Stakeholder Votes"),
  ).toBeVisible()

  await page.getByRole("button", { name: "Rate 4 of 5" }).click()
  await page.getByRole("button", { name: "Submit Vote" }).click()

  await expect(page.getByText("4.0 avg (1 vote)")).toBeVisible()
})
