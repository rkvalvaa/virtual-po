// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanupTestOrg, createTestOrg, createTestUser, hasDb, type TestOrg, type TestUser } from '@/test/db-helpers'
import { query } from '@/lib/db/pool'
import { createInternalForm, publishForm } from '@/lib/db/queries/intake-forms'
import { createServiceGroup } from '@/lib/db/queries/service-groups'

const actor = vi.hoisted(() => ({ id: '', orgId: '', role: 'STAKEHOLDER' }))
vi.mock('@/lib/auth/session', () => ({ requireAuth: async () => ({ user: actor }) }))
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`REDIRECT ${url}`) } }))

import { submitInternalForm } from './actions'

function formData(entries: Record<string, string>) {
  const data = new FormData()
  for (const [key, value] of Object.entries(entries)) data.set(key, value)
  return data
}

describe.skipIf(!hasDb())('submitInternalForm', () => {
  let org: TestOrg
  let otherOrg: TestOrg
  let admin: TestUser
  let member: TestUser
  let groupId: string
  let otherGroupId: string
  let formId: string

  beforeAll(async () => {
    org = await createTestOrg('internal-form-action')
    otherOrg = await createTestOrg('internal-form-action-other')
    admin = await createTestUser(org, 'ADMIN')
    member = await createTestUser(org, 'STAKEHOLDER')
    groupId = (await createServiceGroup(org.id, admin.id, { name: 'IT Operations', fallbackOwnerId: admin.id })).id
    otherGroupId = (await createServiceGroup(org.id, admin.id, { name: 'Facilities', fallbackOwnerId: admin.id })).id
    formId = (await createInternalForm(org.id, admin.id, groupId, 'Change request')).id
    await publishForm(org.id, admin.id, formId)
    Object.assign(actor, { id: member.id, orgId: org.id })
  })
  afterAll(async () => {
    await cleanupTestOrg(org, [admin.id, member.id])
    await cleanupTestOrg(otherOrg)
  })

  const answers = { summary: 'Replace the badge readers', affected: 'Oslo office', reason: 'End of life', scope: 'Two doors', impact: 'None' }

  it('files the change request and opens it, ignoring forged type, group, organization and state fields', async () => {
    const key = crypto.randomUUID()
    const forged = { ...answers, __submissionKey: key, request_type: 'PRODUCT', service_group_id: otherGroupId,
      organization_id: otherOrg.id, workflow_state: 'CLOSED', requester_id: admin.id }
    let target = ''
    try { await submitInternalForm(formId, null, formData(forged)) } catch (error) { target = (error as Error).message }
    expect(target).toMatch(/^REDIRECT \/requests\/[0-9a-f-]{36}$/)

    const row = (await query(`SELECT id, organization_id, requester_id, request_type, service_group_id, workflow_state, workflow_version
      FROM feature_requests WHERE creation_key = $1`, [key])).rows[0]
    expect(target).toBe(`REDIRECT /requests/${row.id}`)
    expect(row).toMatchObject({ organization_id: org.id, requester_id: member.id, request_type: 'CHANGE', service_group_id: groupId,
      workflow_state: 'SUBMITTED', workflow_version: 1 })
  })

  it('shows field errors, and refuses a missing key or an unknown form', async () => {
    const invalid = await submitInternalForm(formId, null, formData({ ...answers, reason: '', __submissionKey: crypto.randomUUID() }))
    expect(invalid).toMatchObject({ status: 'invalid', errors: { reason: expect.any(String) } })
    expect(await submitInternalForm(formId, null, formData(answers))).toMatchObject({ status: 'error' })
    expect(await submitInternalForm(crypto.randomUUID(), null, formData({ ...answers, __submissionKey: crypto.randomUUID() })))
      .toEqual({ status: 'error', message: 'This form is not available.' })
  })
})
