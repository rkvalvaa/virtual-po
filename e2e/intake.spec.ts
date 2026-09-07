import { expect, test } from "@playwright/test"
import { loginAs } from "./helpers/auth"
import { readSeed } from "./helpers/seed"

/** The fixed reply from e2e/mock-anthropic.mjs — keep the two in sync. */
const MOCK_REPLY = "Thanks. What problem does this solve for users?"

test("intake chat streams replies from the mocked Anthropic API", async ({
  page,
}) => {
  await loginAs(page, readSeed().stakeholderEmail)

  await page.goto("/requests/new")
  await page
    .getByLabel("Working title (optional)")
    .fill(`E2E intake chat ${Date.now()}`)
  await page.getByRole("button", { name: /start from scratch/i }).click()
  await expect(page.getByText("Intake Agent", { exact: true })).toBeVisible()

  const input = page.getByPlaceholder("Describe your feature request...")
  const send = page.getByRole("button", { name: "Send" })
  const replies = page.getByText(MOCK_REPLY)

  await input.fill("We need bulk CSV export for the backlog.")
  await send.click()
  await expect(replies).toHaveCount(1)

  // The send button re-enables only once the first stream has finished, so this
  // also asserts the stream terminated cleanly.
  await input.fill("It saves our PMs a manual copy-paste every sprint.")
  await send.click()
  await expect(replies).toHaveCount(2)
})
