import fs from "node:fs"
import pool from "@/lib/db/pool"
import { cleanupTestOrg } from "@/test/db-helpers"
import { SEED_PATH, readSeed } from "./helpers/seed"

export default async function globalTeardown() {
  if (!fs.existsSync(SEED_PATH)) return

  const seed = readSeed()
  await cleanupTestOrg({ id: seed.orgId, slug: seed.orgSlug }, seed.userIds)
  fs.rmSync(SEED_PATH, { force: true })
  await pool.end()
}
