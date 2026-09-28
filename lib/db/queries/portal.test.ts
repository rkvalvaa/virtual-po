// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { cleanupTestOrg, createTestOrg, createTestUser, hasDb, type TestOrg } from '@/test/db-helpers'
import { query } from '@/lib/db/pool'
import { addClientContact, createClientAccount } from './client-accounts'
import { createForm, publishForm, saveFormDraft, setFormPaused } from './intake-forms'
import { getMyRequest, getPortalForm, listMyRequests, listPortalForms, submitPortalRequest, PORTAL_SUBMISSIONS_PER_HOUR } from './portal'
import { applyDecision } from '@/lib/decisions/apply'
import { getPortalOrigin } from './feature-requests'
import type { FormDefinition } from '@/lib/forms/definition'

const definition: FormDefinition = {
  title: 'Listing change',
  instructions: '',
  titleFieldKey: 'summary',
  maxAttachments: 0,
  fields: [
    { key: 'summary', label: 'Summary', type: 'TEXT', required: true, options: [], showIf: null },
    { key: 'area', label: 'Area', type: 'SELECT', required: true, options: ['Listings', 'Search'], showIf: null },
    { key: 'details', label: 'Details', type: 'LONG_TEXT', required: false, options: [], showIf: null },
  ],
}

describe.skipIf(!hasDb())('portal form submissions', () => {
  const fixtures: { org: TestOrg; users: string[] }[] = []
  async function setup() {
    const org = await createTestOrg('portal-submit')
    const admin = await createTestUser(org, 'ADMIN')
    const reviewer = await createTestUser(org, 'REVIEWER')
    const stakeholder = await createTestUser(org, 'STAKEHOLDER')
    const client = await createClientAccount(org.id, admin.id, 'Submitting client')
    const otherClient = await createClientAccount(org.id, admin.id, 'Another client')
    const email = `submitter-${crypto.randomUUID()}@client.example`
    const contact = await addClientContact(org.id, admin.id, client.id, email)
    const user = await query<{ id: string }>('INSERT INTO users (email) VALUES ($1) RETURNING id', [email])
    fixtures.push({ org, users: [admin.id, reviewer.id, stakeholder.id, user.rows[0].id] })
    const publish = async (clientId: string) => {
      const { id } = await createForm(org.id, admin.id, clientId, 'Listing change')
      await saveFormDraft(org.id, admin.id, id, definition)
      await publishForm(org.id, admin.id, id)
      return id
    }
    const formId = await publish(client.id)
    const who = { userId: user.rows[0].id, clientContactId: contact.id, clientAccountId: client.id }
    return { org, admin, reviewer, stakeholder, client, otherClient, formId, who, publish }
  }
  afterEach(async () => { for (const { org, users } of fixtures.splice(0)) await cleanupTestOrg(org, users) })

  const answers = { summary: 'Update the hero image', area: 'Listings', details: 'On the Oslo page' }

  it('creates a request under review from the published form and tells reviewers', async () => {
    const { org, reviewer, stakeholder, formId, who } = await setup()
    const result = await submitPortalRequest({ formId, contact: who, submissionKey: crypto.randomUUID(), answers })
    expect(result.status).toBe('received')
    if (result.status !== 'received') return
    expect(result.reference).toMatch(/^[A-HJ-NP-Z2-9]{10}$/)

    const row = (await query(`SELECT * FROM feature_requests WHERE public_reference = $1`, [result.reference])).rows[0]
    expect(row).toMatchObject({
      organization_id: org.id, requester_id: who.userId, status: 'UNDER_REVIEW', title: 'Update the hero image',
      source_form_id: formId, source_form_version: 1, client_account_id: who.clientAccountId, submitter_contact_id: who.clientContactId,
    })
    expect(row.form_answers).toEqual([
      { key: 'summary', label: 'Summary', value: 'Update the hero image' },
      { key: 'area', label: 'Area', value: 'Listings' },
      { key: 'details', label: 'Details', value: 'On the Oslo page' },
    ])
    expect(await getPortalOrigin(row.id, org.id)).toMatchObject({
      reference: result.reference, clientName: 'Submitting client', contactEmail: expect.stringMatching(/^submitter-/),
      formTitle: 'Listing change', formVersion: 1, answers: row.form_answers,
    })
    expect(await getPortalOrigin(row.id, crypto.randomUUID())).toBeNull()
    const notified = await query(`SELECT user_id FROM notifications WHERE request_id = $1 AND type = 'REVIEW_NEEDED'`, [row.id])
    expect(notified.rows.map((r) => r.user_id)).toContain(reviewer.id)
    expect(notified.rows.map((r) => r.user_id)).not.toContain(stakeholder.id)
    expect(notified.rows.map((r) => r.user_id)).not.toContain(who.userId)
  })

  it('never notifies the contact about later internal changes', async () => {
    const { org, reviewer, formId, who } = await setup()
    const result = await submitPortalRequest({ formId, contact: who, submissionKey: crypto.randomUUID(), answers })
    if (result.status !== 'received') throw new Error('not received')
    const { id } = (await query(`SELECT id FROM feature_requests WHERE public_reference = $1`, [result.reference])).rows[0]
    await applyDecision({ requestId: id, organizationId: org.id, userId: reviewer.id, decision: 'DEFER', rationale: 'Later' })
    const toContact = await query(`SELECT 1 FROM notifications WHERE user_id = $1`, [who.userId])
    expect(toContact.rowCount).toBe(0)
  })

  it('returns the same receipt for a retried submission and creates one request', async () => {
    const { formId, who } = await setup()
    const submissionKey = crypto.randomUUID()
    const first = await submitPortalRequest({ formId, contact: who, submissionKey, answers })
    const second = await submitPortalRequest({ formId, contact: who, submissionKey, answers: { ...answers, summary: 'Changed on retry' } })
    expect(second).toEqual(first)
    const rows = await query(`SELECT 1 FROM feature_requests WHERE submitter_contact_id = $1`, [who.clientContactId])
    expect(rows.rowCount).toBe(1)
  })

  it('treats another client\'s form and a paused form as not found', async () => {
    const { org, admin, otherClient, formId, who, publish } = await setup()
    const otherForm = await publish(otherClient.id)
    await expect(submitPortalRequest({ formId: otherForm, contact: who, submissionKey: crypto.randomUUID(), answers })).rejects.toThrow('Form not found.')
    expect(await getPortalForm(otherForm, who.clientAccountId)).toBeNull()

    await setFormPaused(org.id, admin.id, formId, true)
    await expect(submitPortalRequest({ formId, contact: who, submissionKey: crypto.randomUUID(), answers })).rejects.toThrow('Form not found.')
    expect(await listPortalForms(who.clientAccountId)).toEqual([])
  })

  it('reports invalid answers per field and creates nothing', async () => {
    const { formId, who } = await setup()
    const result = await submitPortalRequest({ formId, contact: who, submissionKey: crypto.randomUUID(), answers: { area: 'Elsewhere' } })
    expect(result).toEqual({ status: 'invalid', errors: { summary: 'Summary is required', area: 'Area must be one of: Listings, Search' } })
    expect((await query(`SELECT 1 FROM feature_requests WHERE submitter_contact_id = $1`, [who.clientContactId])).rowCount).toBe(0)
  })

  it('limits how many requests one contact can send per hour', async () => {
    const { formId, who } = await setup()
    for (let i = 0; i < PORTAL_SUBMISSIONS_PER_HOUR; i++) {
      await submitPortalRequest({ formId, contact: who, submissionKey: crypto.randomUUID(), answers })
    }
    await expect(submitPortalRequest({ formId, contact: who, submissionKey: crypto.randomUUID(), answers })).rejects.toThrow(/Try again later/)
  })

  it('lists and shows a contact only their own requests, with a client-safe history', async () => {
    const { org, admin, reviewer, client, formId, who } = await setup()
    const mine = await submitPortalRequest({ formId, contact: who, submissionKey: crypto.randomUUID(), answers })
    if (mine.status !== 'received') throw new Error('not received')
    const { id } = (await query('SELECT id FROM feature_requests WHERE public_reference = $1', [mine.reference])).rows[0]
    await query(`INSERT INTO comments (request_id, author_id, content) VALUES ($1, $2, 'INTERNAL: margin is thin')`, [id, reviewer.id])
    await applyDecision({ requestId: id, organizationId: org.id, userId: reviewer.id, decision: 'APPROVE', rationale: 'Cheap win' })

    const colleagueEmail = `colleague-${crypto.randomUUID()}@client.example`
    const colleague = await addClientContact(org.id, admin.id, client.id, colleagueEmail)
    const colleagueUser = await query<{ id: string }>('INSERT INTO users (email) VALUES ($1) RETURNING id', [colleagueEmail])
    fixtures[fixtures.length - 1].users.push(colleagueUser.rows[0].id)
    const other = { userId: colleagueUser.rows[0].id, clientContactId: colleague.id, clientAccountId: client.id }

    const list = await listMyRequests(who)
    expect(list).toEqual([{ reference: mine.reference, title: 'Update the hero image', status: 'Planned', submittedAt: expect.any(String) }])
    expect(await listMyRequests(other)).toEqual([])

    const detail = await getMyRequest(who, mine.reference)
    expect(Object.keys(detail!).sort()).toEqual(['answers', 'files', 'history', 'messages', 'reference', 'status', 'submittedAt', 'title'])
    expect(detail!.status).toBe('Planned')
    expect(detail!.history.map(h => h.label)).toEqual(['Received', 'Under review', 'Planned'])
    expect(JSON.stringify(detail)).not.toMatch(/margin is thin|Cheap win|UNDER_REVIEW|APPROVED/)
    expect(await getMyRequest(other, mine.reference)).toBeNull()
    expect(await getMyRequest({ ...who, clientAccountId: crypto.randomUUID() }, mine.reference)).toBeNull()
  })
})
