// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanupTestOrg, createTestOrg, createTestUser, hasDb, type TestOrg, type TestUser } from '@/test/db-helpers'
import { query } from '@/lib/db/pool'
import { addClientContact, createClientAccount } from '@/lib/db/queries/client-accounts'
import { createForm, publishForm, saveFormDraft } from '@/lib/db/queries/intake-forms'

const contact = vi.hoisted(() => ({ userId: '', clientContactId: '', clientAccountId: '' }))
vi.mock('@/lib/auth/session', () => ({ requirePortalContact: async () => contact }))

import { submitPortalForm } from './actions'

function data(entries: Record<string, string>) {
  const form = new FormData()
  for (const [key, value] of Object.entries(entries)) form.set(key, value)
  return form
}

describe.skipIf(!hasDb())('submitPortalForm', () => {
  let org: TestOrg
  let admin: TestUser
  let formId: string
  let foreignFormId: string
  beforeAll(async () => {
    org = await createTestOrg('portal-action')
    admin = await createTestUser(org, 'ADMIN')
    const client = await createClientAccount(org.id, admin.id, 'Action client')
    const foreign = await createClientAccount(org.id, admin.id, 'Foreign client')
    const email = `action-${crypto.randomUUID()}@client.example`
    const added = await addClientContact(org.id, admin.id, client.id, email)
    const user = await query<{ id: string }>('INSERT INTO users (email) VALUES ($1) RETURNING id', [email])
    Object.assign(contact, { userId: user.rows[0].id, clientContactId: added.id, clientAccountId: client.id })
    const definition = {
      title: 'Feedback', instructions: '', titleFieldKey: 'summary', maxAttachments: 0,
      fields: [{ key: 'summary', label: 'Summary', type: 'TEXT' as const, required: true, options: [], showIf: null }],
    }
    for (const [clientId, set] of [[client.id, (id: string) => { formId = id }], [foreign.id, (id: string) => { foreignFormId = id }]] as const) {
      const { id } = await createForm(org.id, admin.id, clientId, 'Feedback')
      await saveFormDraft(org.id, admin.id, id, definition)
      await publishForm(org.id, admin.id, id)
      set(id)
    }
  })
  afterAll(async () => cleanupTestOrg(org, [admin.id, contact.userId]))

  it('files the request and returns a receipt', async () => {
    const state = await submitPortalForm(formId, null, data({ __submissionKey: crypto.randomUUID(), summary: 'Please fix search' }))
    expect(state).toMatchObject({ status: 'received', reference: expect.any(String) })
  })

  it('ignores forged fields and answers not-found for another client\'s form', async () => {
    const forged = data({ __submissionKey: crypto.randomUUID(), summary: 'Forged', organization_id: crypto.randomUUID(), status: 'APPROVED' })
    expect(await submitPortalForm(foreignFormId, null, forged)).toEqual({ status: 'error', message: 'This form is not available.' })
    const state = await submitPortalForm(formId, null, forged)
    if (state?.status !== 'received') throw new Error('not received')
    const row = (await query('SELECT organization_id, status FROM feature_requests WHERE public_reference = $1', [state.reference])).rows[0]
    expect(row).toEqual({ organization_id: org.id, status: 'UNDER_REVIEW' })
  })

  it('refuses a submission without a valid submission key', async () => {
    expect(await submitPortalForm(formId, null, data({ summary: 'No key' }))).toMatchObject({ status: 'error' })
  })
})
