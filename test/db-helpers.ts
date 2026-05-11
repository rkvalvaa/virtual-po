import crypto from 'node:crypto'
import { query } from '@/lib/db/pool'
import type { UserRole } from '@/lib/types/database'

/**
 * Skip a vitest describe/it block when DATABASE_URL is not configured.
 *
 * Usage:
 *   describe.skipIf(!hasDb())('votes queries', () => { ... })
 *
 * This lets local development without Postgres still pass `npm test` —
 * pure-function tests run, DB tests are skipped. CI sets DATABASE_URL via
 * the Postgres service container so the full suite runs there.
 */
export function hasDb(): boolean {
  return Boolean(process.env.DATABASE_URL)
}

/**
 * Short random suffix used to namespace fixture data per test, avoiding
 * collisions on unique columns (organizations.slug, users.email).
 */
export function randomSuffix(): string {
  return crypto.randomBytes(6).toString('hex')
}

export interface TestOrg {
  id: string
  slug: string
}

export async function createTestOrg(namePrefix = 'test-org'): Promise<TestOrg> {
  const slug = `${namePrefix}-${randomSuffix()}`
  const result = await query<{ id: string }>(
    `INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id`,
    [namePrefix, slug],
  )
  return { id: result.rows[0].id, slug }
}

export interface TestUser {
  id: string
  email: string
}

export async function createTestUser(
  org: TestOrg,
  role: UserRole = 'STAKEHOLDER',
): Promise<TestUser> {
  const suffix = randomSuffix()
  const email = `user-${suffix}@example.test`
  const userResult = await query<{ id: string }>(
    `INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id`,
    [email, `User ${suffix}`],
  )
  const userId = userResult.rows[0].id
  await query(
    `INSERT INTO organization_users (organization_id, user_id, role)
     VALUES ($1, $2, $3)`,
    [org.id, userId, role],
  )
  return { id: userId, email }
}

export interface TestRequest {
  id: string
}

export async function createTestRequest(
  org: TestOrg,
  requester: TestUser,
  title = 'Test feature request',
): Promise<TestRequest> {
  const result = await query<{ id: string }>(
    `INSERT INTO feature_requests (organization_id, requester_id, title)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [org.id, requester.id, title],
  )
  return { id: result.rows[0].id }
}

/**
 * Delete a test org. CASCADE handles cleanup of users (via org membership),
 * feature_requests, votes, activity_log, etc.
 *
 * Note: users themselves are not orphaned by org deletion (users table has
 * no org FK), so we also clean any users created for this org's tests.
 */
export async function cleanupTestOrg(org: TestOrg, userIds: string[] = []): Promise<void> {
  await query(`DELETE FROM organizations WHERE id = $1`, [org.id])
  if (userIds.length > 0) {
    await query(`DELETE FROM users WHERE id = ANY($1)`, [userIds])
  }
}

