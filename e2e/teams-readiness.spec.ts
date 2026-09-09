import { expect, test } from '@playwright/test'
import { loginAs } from './helpers/auth'
import { cleanupTestOrg, createTestOrg, createTestUser } from '@/test/db-helpers'

test('Teams settings keep unvalidated capabilities and approvals visibly unavailable', async ({ page }) => {
  const org = await createTestOrg('teams-readiness'), admin = await createTestUser(org, 'ADMIN')
  try {
    await loginAs(page, admin.email)
    await page.goto('/settings#teams')
    const teams = page.getByRole('region', { name: 'Teams settings' })
    await expect(teams.getByText('Teams availability', { exact: true })).toBeVisible()
    await expect(teams.getByText('Notifications: not validated')).toBeVisible()
    await expect(teams.getByText('Commands: not configured')).toBeVisible()
    await expect(teams.getByText('Approvals: unavailable')).toBeVisible()
  } finally {
    await page.goto('about:blank')
    await cleanupTestOrg(org, [admin.id])
  }
})
