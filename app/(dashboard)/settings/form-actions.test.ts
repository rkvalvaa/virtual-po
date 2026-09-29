// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanupTestOrg, createTestOrg, createTestUser, hasDb, type TestOrg, type TestUser } from '@/test/db-helpers'
import { createClientAccount } from '@/lib/db/queries/client-accounts'
import { createInternalForm, listForms } from '@/lib/db/queries/intake-forms'
import { createServiceGroup } from '@/lib/db/queries/service-groups'
import { manageForms } from './form-actions'

const actor = vi.hoisted(() => ({ id: '', orgId: '', role: 'ADMIN' }))
vi.mock('@/lib/auth/session', () => ({ requireAuth: async () => ({ user: actor }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const verify = vi.hoisted(() => vi.fn())
vi.mock('@/lib/export/delivery', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/export/delivery')>()), verifyLinearDestination: verify }))

describe.skipIf(!hasDb())('manageForms', () => {
  let org: TestOrg
  let admin: TestUser
  let clientId: string
  beforeAll(async () => {
    org = await createTestOrg('form-actions')
    admin = await createTestUser(org, 'ADMIN')
    clientId = (await createClientAccount(org.id, admin.id, 'Action client')).id
  })
  beforeEach(() => Object.assign(actor, { id: admin.id, orgId: org.id, role: 'ADMIN' }))
  afterAll(async () => cleanupTestOrg(org, [admin.id]))

  it('creates a form for an administrator', async () => {
    expect(await manageForms({ kind: 'create', clientAccountId: clientId, title: 'Feedback' })).toEqual({ success: true })
    expect((await listForms(org.id)).map((f) => f.draft.title)).toContain('Feedback')
  })

  it.each(['STAKEHOLDER', 'REVIEWER'])('refuses a %s session', async (role) => {
    actor.role = role
    expect(await manageForms({ kind: 'create', clientAccountId: clientId, title: `By ${role}` })).toMatchObject({ success: false })
  })

  it('returns draft problems instead of throwing', async () => {
    const [form] = await listForms(org.id)
    const result = await manageForms({ kind: 'saveDraft', id: form.id, definition: { ...form.draft, fields: [
      { key: 'area', label: 'Area', type: 'SELECT', required: true, options: [], showIf: null },
    ] } })
    expect(result).toEqual({ success: false, error: 'Area needs at least one option.' })
  })

  it('rejects malformed input', async () => {
    expect(await manageForms({ kind: 'publish', id: 'nope' })).toMatchObject({ success: false })
    expect(await manageForms({ kind: 'saveDraft', id: crypto.randomUUID(), definition: { fields: 'x' } })).toMatchObject({ success: false })
  })

  it('saves a Linear destination only after the connected account accepts it', async () => {
    const group = await createServiceGroup(org.id, admin.id, { name: 'Delivery group', fallbackOwnerId: admin.id })
    const { id } = await createInternalForm(org.id, admin.id, group.id, 'Delivered form')
    verify.mockRejectedValueOnce(new Error('The connected Linear account cannot reach that team.'))
    expect(await manageForms({ kind: 'setDestination', id, teamId: 'team-9', projectId: null }))
      .toEqual({ success: false, error: 'The connected Linear account cannot reach that team.' })
    expect((await listForms(org.id)).find(f => f.id === id)?.destination).toBeNull()

    verify.mockResolvedValueOnce(undefined)
    expect(await manageForms({ kind: 'setDestination', id, teamId: 'team-1', projectId: 'project-1' })).toEqual({ success: true })
    expect(verify).toHaveBeenLastCalledWith(org.id, { integration: 'LINEAR', teamId: 'team-1', projectId: 'project-1' })
    expect((await listForms(org.id)).find(f => f.id === id)?.destination).toEqual({ integration: 'LINEAR', teamId: 'team-1', projectId: 'project-1' })

    expect(await manageForms({ kind: 'setDestination', id, teamId: null, projectId: null })).toEqual({ success: true })
    expect((await listForms(org.id)).find(f => f.id === id)?.destination).toBeNull()
  })
})
