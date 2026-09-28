// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanupTestOrg, createTestOrg, createTestUser, hasDb, type TestOrg } from '@/test/db-helpers'
import { query } from '@/lib/db/pool'
import { addClientContact, createClientAccount } from './client-accounts'
import { createForm, publishForm, saveFormDraft } from './intake-forms'
import { getMyRequest, replyToMyRequest, submitPortalRequest } from './portal'
import { listClientMessages, sendClientMessage } from './client-messages'
import { claimEmailDeliveries, deliverClaimedEmail } from '@/lib/email/outbox'
import { sendProviderEmail } from '@/lib/email/provider'

vi.mock('@/lib/email/provider', () => ({
  sendProviderEmail: vi.fn(async () => ({ accepted: true as const, providerMessageId: `provider-${crypto.randomUUID()}` })),
}))

describe.skipIf(!hasDb())('client messages', () => {
  const fixtures: { org: TestOrg; users: string[] }[] = []
  beforeEach(() => {
    vi.stubEnv('RESEND_API_KEY', 'test-key')
    vi.stubEnv('EMAIL_FROM', 'Virtual PO <notifications@example.test>')
    vi.stubEnv('APP_URL', 'https://vpo.example.test')
    vi.mocked(sendProviderEmail).mockClear()
  })
  afterEach(async () => {
    vi.unstubAllEnvs()
    for (const { org, users } of fixtures.splice(0)) await cleanupTestOrg(org, users)
  })

  async function setup() {
    const org = await createTestOrg('client-messages')
    const admin = await createTestUser(org, 'ADMIN')
    const reviewer = await createTestUser(org, 'REVIEWER')
    const stakeholder = await createTestUser(org, 'STAKEHOLDER')
    const client = await createClientAccount(org.id, admin.id, 'Messaging client')
    const email = `thread-${crypto.randomUUID()}@client.example`
    const contact = await addClientContact(org.id, admin.id, client.id, email, 'Kari')
    const user = await query<{ id: string }>('INSERT INTO users (email) VALUES ($1) RETURNING id', [email])
    const colleagueEmail = `colleague-${crypto.randomUUID()}@client.example`
    const colleague = await addClientContact(org.id, admin.id, client.id, colleagueEmail)
    const colleagueUser = await query<{ id: string }>('INSERT INTO users (email) VALUES ($1) RETURNING id', [colleagueEmail])
    fixtures.push({ org, users: [admin.id, reviewer.id, stakeholder.id, user.rows[0].id, colleagueUser.rows[0].id] })
    const { id: formId } = await createForm(org.id, admin.id, client.id, 'Feedback')
    await saveFormDraft(org.id, admin.id, formId, {
      title: 'Feedback', instructions: '', titleFieldKey: 'summary', maxAttachments: 0,
      fields: [{ key: 'summary', label: 'Summary', type: 'TEXT', required: true, options: [], showIf: null }],
    })
    await publishForm(org.id, admin.id, formId)
    const who = { userId: user.rows[0].id, clientContactId: contact.id, clientAccountId: client.id }
    const other = { userId: colleagueUser.rows[0].id, clientContactId: colleague.id, clientAccountId: client.id }
    const receipt = await submitPortalRequest({ formId, contact: who, submissionKey: crypto.randomUUID(), answers: { summary: 'Search is slow' } })
    if (receipt.status !== 'received') throw new Error('not received')
    const requestId = (await query('SELECT id FROM feature_requests WHERE public_reference = $1', [receipt.reference])).rows[0].id as string
    return { org, admin, reviewer, stakeholder, who, other, email, reference: receipt.reference, requestId, contactId: contact.id }
  }

  const deliver = async (orgId: string) => {
    for (const claim of await claimEmailDeliveries({ orgId })) await deliverClaimedEmail(claim)
    return (await query(`SELECT status, error_code, payload FROM email_deliveries WHERE organization_id = $1 AND kind = 'CLIENT_MESSAGE'`, [orgId])).rows
  }

  it('sends a team message to the contact by email, linking only to the portal', async () => {
    const { org, reviewer, email, reference, requestId } = await setup()
    await sendClientMessage(org.id, reviewer.id, requestId, 'Could you tell us which page?')

    const [delivery] = await deliver(org.id)
    expect(delivery.status).toBe('ACCEPTED')
    expect(delivery.payload.link).toBe(`/portal/requests/${reference}`)
    const toContact = vi.mocked(sendProviderEmail).mock.calls.map(([e]) => e).filter((e) => e.to === email)
    expect(toContact).toHaveLength(1)
    const sent = toContact[0]
    expect(sent.text).toContain(`https://vpo.example.test/portal/requests/${reference}`)
    expect(sent.text).toContain('Could you tell us which page?')
    expect(sent.text).not.toContain('Settings > Email')
    expect(sent.text).not.toContain(`/requests/${requestId}`)
  })

  it('stops a queued email once the contact is revoked', async () => {
    const { org, reviewer, email, requestId, contactId } = await setup()
    await sendClientMessage(org.id, reviewer.id, requestId, 'An update for you')
    await query('UPDATE client_contacts SET revoked_at = NOW() WHERE id = $1', [contactId])
    const [delivery] = await deliver(org.id)
    expect(delivery).toMatchObject({ status: 'FAILED', error_code: 'RECIPIENT_INELIGIBLE' })
    expect(vi.mocked(sendProviderEmail).mock.calls.filter(([e]) => e.to === email)).toEqual([])
  })

  it('shows the thread to the contact without team names, and lets them reply', async () => {
    const { org, reviewer, who, other, reference, requestId } = await setup()
    await sendClientMessage(org.id, reviewer.id, requestId, 'Which page is slow?')
    await replyToMyRequest(who, reference, 'The listing search page')

    const mine = await getMyRequest(who, reference)
    expect(mine!.messages).toEqual([
      { from: 'team', body: 'Which page is slow?', at: expect.any(String) },
      { from: 'you', body: 'The listing search page', at: expect.any(String) },
    ])
    expect(JSON.stringify(mine!.messages)).not.toContain(reviewer.email)

    const internal = await listClientMessages(org.id, requestId)
    expect(internal.map((m) => [m.direction, m.authorName !== null])).toEqual([['TO_CLIENT', true], ['FROM_CLIENT', true]])

    const notified = await query(`SELECT user_id FROM notifications WHERE request_id = $1 AND type = 'COMMENT_ADDED'`, [requestId])
    expect(notified.rows.map((r) => r.user_id)).toEqual([reviewer.id])

    await expect(replyToMyRequest(other, reference, 'Not mine')).rejects.toThrow('Request not found.')
  })

  it('refuses stakeholders, other organizations and requests that did not come from the portal', async () => {
    const { org, stakeholder, reviewer, requestId } = await setup()
    await expect(sendClientMessage(org.id, stakeholder.id, requestId, 'Hi')).rejects.toThrow(/reviewer/i)
    const other = await createTestOrg('client-messages-other')
    const otherReviewer = await createTestUser(other, 'REVIEWER')
    fixtures.push({ org: other, users: [otherReviewer.id] })
    await expect(sendClientMessage(other.id, otherReviewer.id, requestId, 'Hi')).rejects.toThrow('Request not found.')
    const internalOnly = await query<{ id: string }>('INSERT INTO feature_requests (organization_id, requester_id, title) VALUES ($1, $2, $3) RETURNING id', [org.id, reviewer.id, 'Internal'])
    await expect(sendClientMessage(org.id, reviewer.id, internalOnly.rows[0].id, 'Hi')).rejects.toThrow(/client portal/)
  })
})
