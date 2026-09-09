import { expect, test } from '@playwright/test'
import { loginAs } from './helpers/auth'
import { cleanupTestOrg, createTestOrg, createTestUser, randomSuffix } from '@/test/db-helpers'
import { query } from '@/lib/db/pool'

test('email settings show readiness and distinguish provider acceptance from delivery', async ({ page }) => {
  const org = await createTestOrg('email-settings')
  const admin = await createTestUser(org, 'ADMIN')
  const suffix = randomSuffix()
  await query(`INSERT INTO email_deliveries(
      organization_id,recipient_user_id,recipient_email,kind,payload,status,attempt_count,provider_message_id,accepted_at,error_code,error_message)
    VALUES
      ($1,$2,$3,'TEST','{"type":"STATUS_CHANGED","title":"Test","message":"Test"}','ACCEPTED',1,$4,clock_timestamp(),NULL,NULL),
      ($1,$2,$3,'TEST','{"type":"STATUS_CHANGED","title":"Test","message":"Test"}','FAILED',5,NULL,NULL,'PROVIDER_REJECTED','Sender rejected')`,
    [org.id, admin.id, admin.email, `provider-${suffix}`])
  try {
    await loginAs(page, admin.email)
    await page.goto('/settings')
    await page.getByRole('button', { name: 'Email', exact: true }).click()
    await expect(page.getByText('Delivery readiness')).toBeVisible()
    await expect(page.getByText('Accepted by provider', { exact: true })).toBeVisible()
    await expect(page.getByText('Failed', { exact: true })).toBeVisible()
    await expect(page.getByText(/does not confirm inbox delivery/).first()).toBeVisible()
    await expect(page.getByText('Sender rejected')).toBeVisible()
  } finally {
    await page.goto('about:blank')
    await cleanupTestOrg(org, [admin.id])
  }
})
