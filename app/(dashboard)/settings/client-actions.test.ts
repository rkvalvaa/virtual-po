// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanupTestOrg, createTestOrg, createTestUser, hasDb, type TestOrg, type TestUser } from '@/test/db-helpers'
import { query } from '@/lib/db/pool'
import { listClientAccounts } from '@/lib/db/queries/client-accounts'
import { manageClients } from './client-actions'

const actor = vi.hoisted(() => ({ id: '', orgId: '', role: 'ADMIN' }))
vi.mock('@/lib/auth/session', () => ({ requireAuth: async () => ({ user: actor }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

describe.skipIf(!hasDb())('manageClients', () => {
  let org: TestOrg
  let admin: TestUser
  beforeAll(async () => {
    org = await createTestOrg('client-actions')
    admin = await createTestUser(org, 'ADMIN')
  })
  beforeEach(async () => {
    Object.assign(actor, { id: admin.id, orgId: org.id, role: 'ADMIN' })
    await query("UPDATE organization_users SET role = 'ADMIN' WHERE user_id = $1", [admin.id])
  })
  afterAll(async () => cleanupTestOrg(org, [admin.id]))

  it('creates an account for a current administrator', async () => {
    expect(await manageClients({ kind: 'createAccount', name: 'Nordic Homes' })).toEqual({ success: true })
    expect((await listClientAccounts(org.id)).map((a) => a.name)).toContain('Nordic Homes')
  })

  it.each(['STAKEHOLDER', 'REVIEWER'])('refuses a %s session', async (role) => {
    actor.role = role
    expect(await manageClients({ kind: 'createAccount', name: `By ${role}` })).toMatchObject({ success: false })
  })

  it('refuses an administrator whose role was revoked since sign-in', async () => {
    await query("UPDATE organization_users SET role = 'REVIEWER' WHERE user_id = $1", [admin.id])
    expect(await manageClients({ kind: 'createAccount', name: 'Stale admin' })).toMatchObject({ success: false })
    expect((await listClientAccounts(org.id)).map((a) => a.name)).not.toContain('Stale admin')
  })

  it('rejects malformed input', async () => {
    expect(await manageClients({ kind: 'addContact', accountId: 'not-a-uuid', email: 'nope' })).toMatchObject({ success: false })
  })
})
