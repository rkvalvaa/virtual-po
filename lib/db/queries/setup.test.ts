// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { query } from '@/lib/db/pool';
import {
  cleanupTestOrg,
  createTestOrg,
  createTestRequest,
  createTestUser,
  hasDb,
  type TestOrg,
  type TestUser,
} from '@/test/db-helpers';
import {
  getWorkspaceCapabilities,
  getWorkspaceSetup,
  setWorkspaceSetupDismissed,
} from './setup';

describe.skipIf(!hasDb())('workspace setup progress', () => {
  let org: TestOrg;
  let foreign: TestOrg;
  let admin: TestUser;
  let outsider: TestUser;

  beforeAll(async () => {
    org = await createTestOrg('Product workspace');
    foreign = await createTestOrg('setup-foreign');
    admin = await createTestUser(org, 'ADMIN');
    outsider = await createTestUser(foreign, 'STAKEHOLDER');
  });

  afterAll(async () => {
    await cleanupTestOrg(foreign, [outsider.id]);
    await cleanupTestOrg(org, [admin.id]);
  });

  it('derives each completion item from current workspace data', async () => {
    await expect(getWorkspaceSetup(org.id, admin.id)).resolves.toMatchObject({
      orgId: org.id,
      role: 'ADMIN',
      dismissed: false,
      items: {
        workspaceNamed: true,
        collaboratorsAdded: false,
        contextAdded: false,
        firstRequestCreated: false,
      },
    });

    await query('UPDATE organizations SET name = $2 WHERE id = $1', [org.id, '']);
    await query(
      `INSERT INTO organization_invitations
        (organization_id, email, role, token_hash, expires_at, created_by)
       VALUES ($1, 'invitee@example.test', 'STAKEHOLDER', repeat('a', 64), NOW() + INTERVAL '1 day', $2)`,
      [org.id, admin.id],
    );
    await query(
      `INSERT INTO repositories
        (organization_id, github_repo_id, owner, name, full_name, connected_by)
       VALUES ($1, 2070, 'example', 'product', 'example/product', $2)`,
      [org.id, admin.id],
    );
    await createTestRequest(org, admin, 'First setup request');

    await expect(getWorkspaceSetup(org.id, admin.id)).resolves.toMatchObject({
      items: {
        workspaceNamed: false,
        collaboratorsAdded: true,
        contextAdded: true,
        firstRequestCreated: true,
      },
    });

    await query('UPDATE repositories SET is_active = false WHERE organization_id = $1', [org.id]);
    await query(
      `INSERT INTO objectives (organization_id, title, time_frame, status, created_by)
       VALUES ($1, 'Improve activation', '2026-Q4', 'ACTIVE', $2)`,
      [org.id, admin.id],
    );
    await expect(getWorkspaceSetup(org.id, admin.id)).resolves.toMatchObject({
      items: { contextAdded: true },
    });
  });

  it('persists dismissal per current member and supports resuming', async () => {
    await expect(setWorkspaceSetupDismissed(org.id, admin.id, true)).resolves.toBe(true);
    await expect(getWorkspaceSetup(org.id, admin.id)).resolves.toMatchObject({ dismissed: true });
    await expect(setWorkspaceSetupDismissed(org.id, outsider.id, true)).resolves.toBe(false);
    await expect(getWorkspaceSetup(org.id, outsider.id)).resolves.toBeNull();

    await expect(setWorkspaceSetupDismissed(org.id, admin.id, false)).resolves.toBe(true);
    await expect(getWorkspaceSetup(org.id, admin.id)).resolves.toMatchObject({ dismissed: false });
  });

  it('stops reads and writes when membership is revoked', async () => {
    await query(
      'DELETE FROM organization_users WHERE organization_id = $1 AND user_id = $2',
      [org.id, admin.id],
    );
    try {
      await expect(getWorkspaceSetup(org.id, admin.id)).resolves.toBeNull();
      await expect(setWorkspaceSetupDismissed(org.id, admin.id, true)).resolves.toBe(false);
      await expect(getWorkspaceCapabilities(org.id, admin.id)).resolves.toEqual([]);
    } finally {
      await query(
        `INSERT INTO organization_users (organization_id, user_id, role)
         VALUES ($1, $2, 'ADMIN')`,
        [org.id, admin.id],
      );
    }
  });

  it('returns credential-free optional capability readiness', async () => {
    const previous = {
      RESEND_API_KEY: process.env.RESEND_API_KEY,
      EMAIL_FROM: process.env.EMAIL_FROM,
      APP_URL: process.env.APP_URL,
      BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
      TEAMS_BOT_APP_ID: process.env.TEAMS_BOT_APP_ID,
      TEAMS_BOT_APP_SECRET: process.env.TEAMS_BOT_APP_SECRET,
      TEAMS_COMMANDS_VALIDATED: process.env.TEAMS_COMMANDS_VALIDATED,
      TEAMS_NOTIFICATIONS_VALIDATED: process.env.TEAMS_NOTIFICATIONS_VALIDATED,
    };
    process.env.RESEND_API_KEY = 'super-secret-test-key';
    process.env.EMAIL_FROM = 'VPO <setup@example.test>';
    process.env.APP_URL = 'https://vpo.example.test';
    process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_test';
    process.env.TEAMS_BOT_APP_ID = 'setup-bot-id';
    process.env.TEAMS_BOT_APP_SECRET = 'super-secret-teams-key';
    process.env.TEAMS_COMMANDS_VALIDATED = 'true';
    process.env.TEAMS_NOTIFICATIONS_VALIDATED = 'true';
    try {
      await query(
        `INSERT INTO integrations (organization_id, type, name, config, is_active)
         VALUES ($1, 'LINEAR', 'Linear', '{}', true)`,
        [org.id],
      );
      await query(
        `INSERT INTO integrations (organization_id, type, name, config, is_active)
         VALUES ($1, 'TEAMS', 'Teams', '{}', true)`,
        [org.id],
      );
      await query('INSERT INTO teams_tenants (organization_id, tenant_id) VALUES ($1, $2)', [org.id, crypto.randomUUID()]);
      const tenant = (await query<{ tenant_id: string }>('SELECT tenant_id FROM teams_tenants WHERE organization_id=$1', [org.id])).rows[0].tenant_id;
      await query('INSERT INTO teams_identity_bindings (organization_id, tenant_id, teams_user_id, user_id) VALUES ($1, $2, $3, $4)', [org.id, tenant, 'setup-teams-user', admin.id]);
      await query(`INSERT INTO teams_notifications (organization_id, channel_name, webhook_url, event_type)
        VALUES ($1, 'Product', 'https://setup.webhook.office.com/path', 'REQUEST_CREATED')`, [org.id]);
      const capabilities = await getWorkspaceCapabilities(org.id, admin.id);
      expect(capabilities).toEqual(expect.arrayContaining([
        expect.objectContaining({ key: 'email', state: 'READY', optional: true, href: '/settings#email' }),
        expect.objectContaining({ key: 'jira', state: 'NOT_CONFIGURED', href: '/settings#jira' }),
        expect.objectContaining({ key: 'linear', state: 'READY', href: '/settings#linear', adminOnly: true }),
        expect.objectContaining({ key: 'github_issues', state: 'NOT_CONFIGURED', href: '/settings#github-issues' }),
        expect.objectContaining({ key: 'documents', state: 'READY', message: expect.stringMatching(/Plain text and Markdown/) }),
        expect.objectContaining({ key: 'teams_notifications', state: 'READY', href: '/settings#teams', adminOnly: true }),
        expect.objectContaining({ key: 'teams_commands', state: 'READY', href: '/settings#teams', adminOnly: true }),
        expect.objectContaining({ key: 'teams_approvals', state: 'UNSUPPORTED', optional: true }),
      ]));
      expect(JSON.stringify(capabilities)).not.toContain('super-secret-test-key');
      expect(JSON.stringify(capabilities)).not.toContain('super-secret-teams-key');

      process.env.TEAMS_COMMANDS_VALIDATED = 'false';
      process.env.TEAMS_NOTIFICATIONS_VALIDATED = 'false';
      await expect(getWorkspaceCapabilities(org.id, admin.id)).resolves.toEqual(expect.arrayContaining([
        expect.objectContaining({ key: 'teams_notifications', state: 'NOT_CONFIGURED' }),
        expect.objectContaining({ key: 'teams_commands', state: 'NOT_CONFIGURED' }),
        expect.objectContaining({ key: 'teams_approvals', state: 'UNSUPPORTED' }),
      ]));
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it('does not claim document readiness when private blob storage is unavailable', async () => {
    const previous = process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    try {
      await expect(getWorkspaceCapabilities(org.id, admin.id)).resolves.toEqual(expect.arrayContaining([
        expect.objectContaining({ key: 'documents', state: 'NOT_CONFIGURED' }),
      ]));
    } finally {
      if (previous === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
      else process.env.BLOB_READ_WRITE_TOKEN = previous;
    }
  });
});
