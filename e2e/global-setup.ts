import fs from "node:fs"
import { query } from "@/lib/db/pool"
import {
  createTestOrg,
  createTestRequest,
  createTestUser,
  randomSuffix,
} from "@/test/db-helpers"
import { SEED_PATH, type Seed } from "./helpers/seed"

export default async function globalSetup() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must be set to run the E2E suite")
  }
  if (!process.env.E2E_AUTH_TOKEN) {
    throw new Error("E2E_AUTH_TOKEN must be set to run the E2E suite")
  }

  const suffix = randomSuffix()
  const org = await createTestOrg("e2e-org")
  const stakeholder = await createTestUser(org, "STAKEHOLDER")
  const reviewer = await createTestUser(org, "REVIEWER")

  const voteRequestTitle = `E2E vote target ${suffix}`
  const reviewRequestTitle = `E2E review target ${suffix}`
  const voteRequest = await createTestRequest(org, stakeholder, voteRequestTitle)
  const reviewRequest = await createTestRequest(
    org,
    stakeholder,
    reviewRequestTitle,
  )
  await createTestRequest(org, stakeholder, `E2E extra request ${suffix}`)

  await query(`UPDATE feature_requests SET status = 'UNDER_REVIEW' WHERE id = $1`, [
    reviewRequest.id,
  ])

  const seed: Seed = {
    orgId: org.id,
    orgSlug: org.slug,
    userIds: [stakeholder.id, reviewer.id],
    stakeholderEmail: stakeholder.email,
    reviewerEmail: reviewer.email,
    voteRequestId: voteRequest.id,
    voteRequestTitle,
    reviewRequestId: reviewRequest.id,
    reviewRequestTitle,
  }
  fs.writeFileSync(SEED_PATH, JSON.stringify(seed, null, 2))
}
