import { expect, test } from '@playwright/test'
import { loginAs } from './helpers/auth'
import { cleanupTestOrg, createTestOrg, createTestRequest, createTestUser } from '@/test/db-helpers'
import { query } from '@/lib/db/pool'

test('plans a request with keyboard controls and reconciles over-allocation in days', async ({ page }) => {
  const org = await createTestOrg('Planning workspace')
  const admin = await createTestUser(org, 'ADMIN')
  const member = await createTestUser(org, 'STAKEHOLDER')
  const request = await createTestRequest(org, admin, 'Capacity-visible request')
  const now = new Date()
  const quarter = `${now.getFullYear()}-Q${Math.ceil((now.getMonth() + 1) / 3)}`
  const objective = await query<{ id: string }>(
    `INSERT INTO objectives(organization_id,title,time_frame,created_by)
     VALUES($1,'Improve retention',$2,$3) RETURNING id`,
    [org.id, quarter, admin.id],
  )
  await query(
    `INSERT INTO team_capacity(organization_id,quarter,total_capacity_days,allocated_days,updated_by)
     VALUES($1,$2,100,70,$3)`,
    [org.id, quarter, admin.id],
  )
  try {
    await loginAs(page, admin.email)
    await page.getByRole('link', { name: 'Planning', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Delivery planning' })).toBeVisible()
    await page.getByLabel('Assignee for Capacity-visible request').selectOption(member.id)
    await page.getByLabel('Commitment for Capacity-visible request').selectOption('NOW')
    await page.getByLabel('Target period for Capacity-visible request').fill(quarter)
    await page.getByLabel('Manual rank for Capacity-visible request').fill('1')
    await page.getByLabel('Objective for Capacity-visible request').selectOption(objective.rows[0].id)
    await page.getByLabel('Planned effort in days for Capacity-visible request').fill('40')
    await page.getByRole('button', { name: 'Save planning for Capacity-visible request' }).click()

    await expect(page.getByRole('heading', { name: 'Now', exact: true })).toBeVisible()
    await expect(page.getByText(/Allocation is unreconciled/)).toBeVisible()
    await page.getByRole('button', { name: 'Retain legacy as outside work' }).first().click()
    await expect(page.getByText('Over-allocation', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('10 days', { exact: true }).first()).toBeVisible()

    expect((await query(
      `SELECT assignee_id,planning_commitment,target_period,manual_rank,planning_objective_id,planned_effort_days
       FROM feature_requests WHERE id=$1`,
      [request.id],
    )).rows[0]).toMatchObject({
      assignee_id: member.id,
      planning_commitment: 'NOW',
      target_period: quarter,
      manual_rank: 1,
      planning_objective_id: objective.rows[0].id,
      planned_effort_days: '40.00',
    })
  } finally {
    await page.goto('about:blank')
    await cleanupTestOrg(org, [admin.id, member.id])
  }
})
