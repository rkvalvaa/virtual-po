import { expect, test } from '@playwright/test';
import { loginAs } from './helpers/auth';
import { cleanupTestOrg, createTestChangeRequest, createTestOrg, createTestUser } from '@/test/db-helpers';
import { query } from '@/lib/db/pool';

test('a change request shows its workflow instead of the product lifecycle and moves through it', async ({ page }) => {
  const org = await createTestOrg('e2e-change-workflow');
  const admin = await createTestUser(org, 'ADMIN');
  const { id } = await createTestChangeRequest(org, admin, 'Rotate the VPN certificates');
  try {
    await loginAs(page, admin.email);
    await page.goto(`/requests/${id}`);
    const main = page.getByRole('main');
    await expect(main.getByText('Change request', { exact: true })).toBeVisible();
    await expect(main.getByText('Submitted', { exact: true })).toBeVisible();
    await expect(main.getByRole('tab', { name: 'Assessment' })).toHaveCount(0);
    await expect(main.getByRole('button', { name: 'Submit Vote' })).toHaveCount(0);

    await main.getByRole('button', { name: 'Start assessment' }).click();
    await main.getByRole('button', { name: 'Confirm: Start assessment' }).click();
    await expect(main.getByText('Assessing', { exact: true })).toBeVisible();

    await main.getByRole('button', { name: 'Request approval' }).click();
    await main.getByLabel('Implementation plan').fill('Two waves, EU first');
    await main.getByRole('button', { name: 'Confirm: Request approval' }).click();
    await expect(main.getByText('Awaiting approval', { exact: true })).toBeVisible();
    await expect(main.getByText('Two waves, EU first')).toBeVisible();

    expect((await query('SELECT workflow_state, workflow_data FROM feature_requests WHERE id = $1', [id])).rows[0])
      .toEqual({ workflow_state: 'AWAITING_APPROVAL', workflow_data: { implementationPlan: 'Two waves, EU first' } });
  } finally {
    await cleanupTestOrg(org, [admin.id]);
  }
});

test('a reviewer sees a stuck Linear delivery and replays it', async ({ page }) => {
  const org = await createTestOrg('e2e-change-delivery');
  const reviewer = await createTestUser(org, 'REVIEWER');
  const { id } = await createTestChangeRequest(org, reviewer, 'Renew the TLS certificates');
  await query(`INSERT INTO tracker_exports (request_id, organization_id, provider, destination, items, delivery_status, attempts, last_error)
    VALUES ($1, $2, 'LINEAR', '["team-1",null]', $3, 'NEEDS_ATTENTION', 1, 'Linear API error 403: forbidden')`,
    [id, org.id, JSON.stringify([{ id: crypto.randomUUID(), entityId: id, kind: 'SERVICE_TICKET', state: 'ready', title: 'Renew the TLS certificates', body: '' }])]);
  try {
    await loginAs(page, reviewer.email);
    await page.goto(`/requests/${id}`);
    const main = page.getByRole('main');
    await expect(main.getByText('Needs attention', { exact: true })).toBeVisible();
    await expect(main.getByText('Linear API error 403: forbidden')).toBeVisible();
    await main.getByRole('button', { name: 'Replay delivery' }).click();
    await expect(main.getByText('Queued for Linear', { exact: true })).toBeVisible();
    expect((await query('SELECT delivery_status, attempts FROM tracker_exports WHERE request_id = $1', [id])).rows[0])
      .toEqual({ delivery_status: 'QUEUED', attempts: 0 });
  } finally {
    await cleanupTestOrg(org, [reviewer.id]);
  }
});
