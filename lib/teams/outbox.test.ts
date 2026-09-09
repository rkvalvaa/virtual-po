// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanupTestOrg, createTestOrg, createTestRequest, createTestUser, hasDb, type TestOrg, type TestUser } from '@/test/db-helpers'
import { query } from '@/lib/db/pool'
import { logActivity } from '@/lib/db/queries/activity-log'
import { processTeamsOutbox, listTeamsDeliveries } from './outbox'
import { sendTeamsWebhook } from './client'

vi.mock('./client', async original => ({ ...(await original<typeof import('./client')>()), sendTeamsWebhook: vi.fn() }))

describe.skipIf(!hasDb())('durable Teams delivery', () => {
  let org: TestOrg, user: TestUser, requestId: string
  beforeAll(async () => { org = await createTestOrg('teams-outbox'); user = await createTestUser(org, 'ADMIN'); requestId = (await createTestRequest(org, user)).id })
  beforeEach(async () => {
    vi.stubEnv('TEAMS_NOTIFICATIONS_VALIDATED', 'true'); vi.stubEnv('APP_URL', 'https://vpo.example.test')
    vi.mocked(sendTeamsWebhook).mockReset().mockResolvedValue({ accepted: true, httpStatus: 202 })
    await query('DELETE FROM teams_deliveries WHERE organization_id=$1', [org.id]); await query('DELETE FROM teams_notifications WHERE organization_id=$1', [org.id])
    await query(`INSERT INTO integrations(organization_id,type,name,config,is_active) VALUES($1,'TEAMS','Test','{}',true)
      ON CONFLICT(organization_id,type) WHERE is_active=true DO NOTHING`, [org.id])
    await query(`INSERT INTO teams_notifications(organization_id,channel_name,webhook_url,event_type) VALUES($1,'Product','https://tenant.webhook.office.com/path','STATUS_CHANGED')`, [org.id])
  })
  afterEach(() => vi.unstubAllEnvs())
  afterAll(async () => cleanupTestOrg(org, [user.id]))

  it('persists selected events, freezes the card, and records provider acceptance', async () => {
    await logActivity({ organizationId: org.id, requestId, action: 'STATUS_CHANGED', metadata: { to: 'UNDER_REVIEW' } })
    expect((await listTeamsDeliveries(org.id))[0].status).toBe('QUEUED')
    expect(await processTeamsOutbox(org.id)).toEqual({ processed: 1 })
    expect((await listTeamsDeliveries(org.id))[0]).toMatchObject({ status: 'ACCEPTED', attemptCount: 1 })
  })

  it('bounds explicit transient provider retries', async () => {
    await logActivity({ organizationId: org.id, requestId, action: 'STATUS_CHANGED' })
    vi.mocked(sendTeamsWebhook).mockResolvedValue({ accepted: false, httpStatus: 429, retryable: true, ambiguous: false, message: 'Teams returned HTTP 429.' })
    for (let attempt = 0; attempt < 5; attempt++) {
      await query("UPDATE teams_deliveries SET next_attempt_at=clock_timestamp() WHERE organization_id=$1", [org.id])
      await processTeamsOutbox(org.id)
    }
    expect((await listTeamsDeliveries(org.id))[0]).toMatchObject({ status: 'FAILED', attemptCount: 5 })
    expect(sendTeamsWebhook).toHaveBeenCalledTimes(5)
  })

  it('blocks ambiguous thrown outcomes without another provider call', async () => {
    await logActivity({ organizationId: org.id, requestId, action: 'STATUS_CHANGED' })
    vi.mocked(sendTeamsWebhook).mockRejectedValue(new Error('response lost'))
    await processTeamsOutbox(org.id)
    expect((await listTeamsDeliveries(org.id))[0].status).toBe('RECONCILIATION_REQUIRED')
    expect(await processTeamsOutbox(org.id)).toEqual({ processed: 0 })
  })

  it('isolates preparation failures so another claimed destination still sends', async () => {
    await query(`INSERT INTO teams_notifications(organization_id,channel_name,webhook_url,event_type) VALUES($1,'Second','https://second.webhook.office.com/path','STATUS_CHANGED')`, [org.id])
    await logActivity({ organizationId: org.id, requestId, action: 'STATUS_CHANGED' })
    await query(`UPDATE teams_deliveries d SET provider_payload='{"type":"message"}' FROM teams_notifications n
      WHERE d.notification_config_id=n.id AND n.channel_name='Product' AND d.organization_id=$1`, [org.id])
    vi.stubEnv('APP_URL', ''); vi.stubEnv('AUTH_URL', ''); vi.stubEnv('NEXT_PUBLIC_APP_URL', '')
    expect(await processTeamsOutbox(org.id)).toEqual({ processed: 2 })
    const states = await listTeamsDeliveries(org.id)
    expect(states.map(row => row.status).sort()).toEqual(['ACCEPTED', 'FAILED'])
    expect(sendTeamsWebhook).toHaveBeenCalledTimes(1)
  })

  it('fails an exhausted lease that expired before provider I/O instead of stranding it queued', async () => {
    await logActivity({ organizationId: org.id, requestId, action: 'STATUS_CHANGED' })
    await query(`UPDATE teams_deliveries SET status='PROCESSING',attempt_count=5,lease_token=gen_random_uuid(),
      lease_expires_at=clock_timestamp()-interval '1 second',provider_started_at=NULL WHERE organization_id=$1`, [org.id])
    expect(await processTeamsOutbox(org.id)).toEqual({ processed: 0 })
    expect((await listTeamsDeliveries(org.id))[0]).toMatchObject({ status: 'FAILED', attemptCount: 5,
      errorMessage: 'The worker stopped before provider I/O after the retry limit was reached.' })
    expect(sendTeamsWebhook).not.toHaveBeenCalled()
  })

  it('reclaims a pre-I/O lease while another attempt remains', async () => {
    await logActivity({ organizationId: org.id, requestId, action: 'STATUS_CHANGED' })
    await query(`UPDATE teams_deliveries SET status='PROCESSING',attempt_count=4,lease_token=gen_random_uuid(),
      lease_expires_at=clock_timestamp()-interval '1 second',provider_started_at=NULL WHERE organization_id=$1`, [org.id])
    expect(await processTeamsOutbox(org.id)).toEqual({ processed: 1 })
    expect((await listTeamsDeliveries(org.id))[0]).toMatchObject({ status: 'ACCEPTED', attemptCount: 5 })
    expect(sendTeamsWebhook).toHaveBeenCalledTimes(1)
  })
})
