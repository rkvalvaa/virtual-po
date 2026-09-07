import fs from "node:fs"
import path from "node:path"

/** Written by e2e/global-setup.ts, removed by e2e/global-teardown.ts. */
export const SEED_PATH = path.join(__dirname, "..", ".seed.json")

export interface Seed {
  orgId: string
  orgSlug: string
  /** Users created for this run — deleted during teardown. */
  userIds: string[]
  stakeholderEmail: string
  reviewerEmail: string
  voteRequestId: string
  voteRequestTitle: string
  /** Seeded with status UNDER_REVIEW so the review queue has something to show. */
  reviewRequestId: string
  reviewRequestTitle: string
}

export function readSeed(): Seed {
  if (!fs.existsSync(SEED_PATH)) {
    throw new Error(
      `Missing ${SEED_PATH}. The Playwright global setup should have created it.`,
    )
  }
  return JSON.parse(fs.readFileSync(SEED_PATH, "utf8")) as Seed
}
