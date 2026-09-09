// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { query } from '@/lib/db/pool'
import { cleanupTestOrg, createTestOrg, createTestUser, hasDb, type TestOrg, type TestUser } from '@/test/db-helpers'
import { notifyUser } from './notifications'
import { upsertEmailPreference } from './email-preferences'

describe.skipIf(!hasDb())('notification email persistence', () => {
  let org: TestOrg
  let user: TestUser

  beforeAll(async () => {
    org = await createTestOrg('notification-email')
    user = await createTestUser(org)
  })
  afterAll(async () => cleanupTestOrg(org, [user.id]))

  it('persists the notification and its email delivery before returning', async () => {
    await notifyUser({
      organizationId: org.id,
      userId: user.id,
      type: 'COMMENT_ADDED',
      title: '<Someone> commented',
      message: '<b>Hello</b>',
      link: '/requests/123',
    })
    const result = await query(`SELECT d.status,d.payload,n.title FROM email_deliveries d
      JOIN notifications n ON n.id=d.notification_id WHERE n.organization_id=$1`, [org.id])
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toMatchObject({ title: '<Someone> commented' })
    expect(result.rows[0].payload).toMatchObject({ message: '<b>Hello</b>' })
  })

  it('does not enqueue email when the recipient disabled that event type', async () => {
    await upsertEmailPreference(user.id, org.id, 'VOTE_RECEIVED', false)
    await notifyUser({
      organizationId: org.id, userId: user.id, type: 'VOTE_RECEIVED',
      title: 'Vote', message: 'A vote arrived',
    })
    const result = await query(`SELECT d.id FROM email_deliveries d JOIN notifications n ON n.id=d.notification_id
      WHERE n.organization_id=$1 AND n.type='VOTE_RECEIVED'`, [org.id])
    expect(result.rows).toHaveLength(0)
  })
})
