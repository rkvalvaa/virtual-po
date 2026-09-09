// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { query } from '@/lib/db/pool'
import { cleanupTestOrg, createTestOrg, createTestUser, hasDb, type TestOrg, type TestUser } from '@/test/db-helpers'
import {
  claimEmailDeliveries,
  deliverClaimedEmail,
  enqueueAdminTestEmail,
  enqueueNotificationEmail,
  listEmailDeliveries,
  processEmailOutbox,
  ingestEmailProviderEvent,
  retryEmailDelivery,
} from './outbox'
import { sendProviderEmail } from './provider'

vi.mock('./provider', () => ({
  sendProviderEmail: vi.fn(async () => ({ accepted: true as const, providerMessageId: 'provider-1' })),
}))

describe.skipIf(!hasDb())('durable email delivery', () => {
  let org: TestOrg
  let admin: TestUser
  let recipient: TestUser

  beforeAll(async () => {
    org = await createTestOrg('email-outbox')
    admin = await createTestUser(org, 'ADMIN')
    recipient = await createTestUser(org, 'STAKEHOLDER')
  })

  beforeEach(async () => {
    vi.stubEnv('RESEND_API_KEY', 'test-key')
    vi.stubEnv('EMAIL_FROM', 'Virtual PO <notifications@example.test>')
    vi.stubEnv('APP_URL', 'https://vpo.example.test')
    vi.mocked(sendProviderEmail).mockReset().mockResolvedValue({ accepted: true, providerMessageId: 'provider-1' })
    await query('DELETE FROM email_deliveries WHERE organization_id=$1', [org.id])
    await query("DELETE FROM email_provider_events WHERE provider_message_id LIKE 'provider-%'")
  })

  afterEach(() => vi.unstubAllEnvs())
  afterAll(async () => cleanupTestOrg(org, [admin.id, recipient.id]))

  async function notification(type = 'COMMENT_ADDED', requestId: string | null = null) {
    const result = await query(`INSERT INTO notifications(organization_id,user_id,type,title,message,link,request_id)
      VALUES($1,$2,$3,'<script>Title</script>','<b>message</b>','/requests/1',$4) RETURNING id`,
      [org.id, recipient.id, type, requestId])
    return result.rows[0].id as string
  }

  it('persists unavailable work with safe feedback and never invokes the provider', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    const notificationId = await notification()
    const delivery = await enqueueNotificationEmail({
      organizationId: org.id, recipientUserId: recipient.id, recipientEmail: recipient.email,
      recipientName: '<Admin>', notificationId, type: 'COMMENT_ADDED',
      title: '<Title>', message: '<b>message</b>', link: '/requests/1',
    })
    expect(delivery.status).toBe('UNAVAILABLE')
    expect(await processEmailOutbox({ orgId: org.id })).toEqual({ processed: 0 })
    expect(sendProviderEmail).not.toHaveBeenCalled()
    expect(JSON.stringify((await listEmailDeliveries(org.id))[0])).not.toContain('test-key')
  })

  it('sends literal untrusted content using one stable provider idempotency key', async () => {
    const notificationId = await notification()
    const delivery = await enqueueNotificationEmail({
      organizationId: org.id, recipientUserId: recipient.id, recipientEmail: recipient.email,
      recipientName: '<Admin>', notificationId, type: 'COMMENT_ADDED',
      title: '<script>Title</script>', message: '<b>message</b>', link: '/requests/1',
    })
    await processEmailOutbox({ orgId: org.id })
    const call = vi.mocked(sendProviderEmail).mock.calls[0][0]
    expect(call.idempotencyKey).toBe(`email-delivery/${delivery.id}/1`)
    expect(call.html).not.toContain('<script>')
    expect(call.html).not.toContain('<b>message</b>')
    expect(call.html).toContain('&lt;script&gt;Title&lt;/script&gt;')
    expect(call.html).toContain('https://vpo.example.test/requests/1')
    expect((await listEmailDeliveries(org.id))[0]).toMatchObject({ status: 'ACCEPTED', providerMessageId: 'provider-1' })
  })

  it('retries returned transient errors with the frozen payload and provider key', async () => {
    vi.mocked(sendProviderEmail)
      .mockResolvedValueOnce({ accepted: false, errorCode: 'rate_limit_exceeded', message: 'Rate limited', retryable: true })
      .mockResolvedValueOnce({ accepted: true, providerMessageId: 'provider-2' })
    const delivery = await enqueueAdminTestEmail(org.id, admin.id)
    await processEmailOutbox({ orgId: org.id })
    const firstCall = vi.mocked(sendProviderEmail).mock.calls[0][0]
    vi.stubEnv('EMAIL_FROM', 'Changed <changed@example.test>')
    vi.stubEnv('APP_URL', 'https://changed.example.test')
    await query('UPDATE email_deliveries SET next_attempt_at=clock_timestamp() WHERE id=$1', [delivery.id])
    await processEmailOutbox({ orgId: org.id })
    expect(sendProviderEmail).toHaveBeenCalledTimes(2)
    expect(vi.mocked(sendProviderEmail).mock.calls[1][0]).toEqual(firstCall)
    expect((await listEmailDeliveries(org.id))[0].status).toBe('ACCEPTED')
  })

  it('treats thrown errors and expired leases as ambiguous outcomes with bounded retries', async () => {
    vi.mocked(sendProviderEmail).mockRejectedValue(new Error('socket ended after upload'))
    const delivery = await enqueueAdminTestEmail(org.id, admin.id)
    const [stale] = await claimEmailDeliveries({ orgId: org.id })
    await query("UPDATE email_deliveries SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [delivery.id])
    await processEmailOutbox({ orgId: org.id })
    await deliverClaimedEmail(stale)
    for (let attempt = 0; attempt < 5; attempt++) {
      await query('UPDATE email_deliveries SET next_attempt_at=clock_timestamp() WHERE id=$1', [delivery.id])
      await processEmailOutbox({ orgId: org.id })
    }
    const [result] = await listEmailDeliveries(org.id)
    expect(result).toMatchObject({ status: 'RECONCILIATION_REQUIRED', errorCode: 'AMBIGUOUS_OUTCOME' })
    expect(vi.mocked(sendProviderEmail)).toHaveBeenCalledTimes(5)
    const attempts = await query('SELECT outcome FROM email_delivery_attempts WHERE delivery_id=$1 ORDER BY attempt_number', [delivery.id])
    expect(attempts.rows.map(row => row.outcome)).toEqual(['INTERRUPTED', 'UNKNOWN', 'UNKNOWN', 'UNKNOWN', 'UNKNOWN', 'UNKNOWN'])
  })

  it('does not duplicate concurrent claims and bounds manual retry cycles', async () => {
    vi.mocked(sendProviderEmail).mockResolvedValue({ accepted: false, errorCode: 'validation_error', message: 'Sender rejected', retryable: false })
    const delivery = await enqueueAdminTestEmail(org.id, admin.id)
    const results = await Promise.all([processEmailOutbox({ orgId: org.id }), processEmailOutbox({ orgId: org.id })])
    expect(results.reduce((sum, result) => sum + result.processed, 0)).toBe(1)
    expect(sendProviderEmail).toHaveBeenCalledTimes(1)
    expect(await retryEmailDelivery(org.id, delivery.id, recipient.id)).toBe(false)
    vi.stubEnv('EMAIL_FROM', 'Changed <changed@example.test>')
    expect(await retryEmailDelivery(org.id, delivery.id, admin.id)).toBe(true)
    expect(await retryEmailDelivery(org.id, delivery.id, admin.id)).toBe(false)
    await processEmailOutbox({ orgId: org.id })
    expect(vi.mocked(sendProviderEmail).mock.calls[1][0]).toMatchObject({
      from: 'Changed <changed@example.test>', idempotencyKey: `email-delivery/${delivery.id}/2`,
    })
    expect(await retryEmailDelivery(org.id, delivery.id, admin.id)).toBe(false)
  })

  it('durably reconciles a provider webhook that arrives before acceptance is persisted', async () => {
    const delivery = await enqueueAdminTestEmail(org.id, admin.id)
    vi.mocked(sendProviderEmail).mockImplementationOnce(async () => {
      await ingestEmailProviderEvent({ eventId: 'svix-early', providerMessageId: 'provider-early', eventType: 'email.delivered', occurredAt: new Date('2026-09-09T09:00:00Z'), detail: null, deliveryId: delivery.id })
      await ingestEmailProviderEvent({ eventId: 'svix-opened', providerMessageId: 'provider-early', eventType: 'email.opened', occurredAt: new Date('2026-09-09T09:01:00Z'), detail: null, deliveryId: delivery.id })
      throw new Error('provider response lost')
    })
    await processEmailOutbox({ orgId: org.id })
    expect((await listEmailDeliveries(org.id))[0]).toMatchObject({ status: 'DELIVERED', deliveredAt: expect.any(String) })
    expect(sendProviderEmail).toHaveBeenCalledTimes(1)
    expect((await query("SELECT count(*)::int AS count FROM email_delivery_attempts WHERE delivery_id=$1 AND outcome='PROCESSING'", [delivery.id])).rows[0].count).toBe(0)
    expect(await ingestEmailProviderEvent({ eventId: 'svix-early', providerMessageId: 'provider-early', eventType: 'email.delivered', occurredAt: new Date('2026-09-09T09:00:00Z'), detail: null, deliveryId: delivery.id })).toBe(false)
    expect(await ingestEmailProviderEvent({ eventId: 'svix-unmatched', providerMessageId: 'provider-unmatched', eventType: 'email.delivered', occurredAt: new Date('2026-09-09T09:00:00Z'), detail: null, deliveryId: '01994ca8-d493-7000-8000-000000000099' })).toBe(true)
  })

  it('blocks ambiguous retries after the provider idempotency window expires', async () => {
    const delivery = await enqueueAdminTestEmail(org.id, admin.id)
    const [claim] = await claimEmailDeliveries({ orgId: org.id })
    await query(`UPDATE email_delivery_attempts SET provider_started_at=clock_timestamp() WHERE lease_token=$1`, [claim.leaseToken])
    await query(`UPDATE email_deliveries SET lease_expires_at=clock_timestamp()-interval '1 second',
      first_attempt_at=clock_timestamp()-interval '25 hours',idempotency_expires_at=clock_timestamp()-interval '1 hour' WHERE id=$1`, [delivery.id])
    await processEmailOutbox({ orgId: org.id })
    expect((await listEmailDeliveries(org.id))[0].status).toBe('RECONCILIATION_REQUIRED')
    expect(sendProviderEmail).not.toHaveBeenCalled()
    expect(await retryEmailDelivery(org.id, delivery.id, admin.id)).toBe(false)
  })

  it('revalidates membership, address, role, and preferences immediately before dispatch', async () => {
    const notificationId = await notification('VOTE_RECEIVED')
    const delivery = await enqueueNotificationEmail({
      organizationId: org.id, recipientUserId: recipient.id, recipientEmail: recipient.email,
      recipientName: 'Recipient', notificationId, type: 'VOTE_RECEIVED', title: 'Vote', message: 'Sensitive', link: '/requests/1',
    })
    await query(`INSERT INTO email_preferences(user_id,organization_id,notification_type,email_enabled)
      VALUES($1,$2,'VOTE_RECEIVED',false) ON CONFLICT(user_id,organization_id,notification_type) DO UPDATE SET email_enabled=false`, [recipient.id, org.id])
    await processEmailOutbox({ orgId: org.id })
    expect(sendProviderEmail).not.toHaveBeenCalled()
    expect((await listEmailDeliveries(org.id)).find(item => item.id === delivery.id)).toMatchObject({ status: 'FAILED', errorCode: 'RECIPIENT_INELIGIBLE' })

    const test = await enqueueAdminTestEmail(org.id, admin.id)
    await query("UPDATE organization_users SET role='REVIEWER' WHERE organization_id=$1 AND user_id=$2", [org.id, admin.id])
    await processEmailOutbox({ orgId: org.id, deliveryId: test.id })
    expect(sendProviderEmail).not.toHaveBeenCalled()
    expect((await listEmailDeliveries(org.id)).find(item => item.id === test.id)).toMatchObject({ status: 'FAILED', errorCode: 'RECIPIENT_INELIGIBLE' })
    await query("UPDATE organization_users SET role='ADMIN' WHERE organization_id=$1 AND user_id=$2", [org.id, admin.id])
  })

  it('requires a current administrator membership for tests and scopes history by organization', async () => {
    const outsiderOrg = await createTestOrg('email-outsider')
    try {
      await expect(enqueueAdminTestEmail(outsiderOrg.id, admin.id)).rejects.toThrow('administrator')
      const delivery = await enqueueAdminTestEmail(org.id, admin.id)
      expect((await listEmailDeliveries(outsiderOrg.id)).find(item => item.id === delivery.id)).toBeUndefined()
    } finally {
      await cleanupTestOrg(outsiderOrg)
    }
  })
})
