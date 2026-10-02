// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { query } from '@/lib/db/pool';
import { cleanupTestOrg, createTestOrg, hasDb, type TestOrg } from '@/test/db-helpers';
import { isEncrypted } from '@/lib/crypto/integration-secrets';
import { getIntegrationBySlackTeamId, getIntegrationByType, upsertIntegration } from './jira-sync';
import { reencryptIntegrationSecrets } from './integration-secrets';

async function storedConfig(orgId: string, type: string): Promise<Record<string, unknown>> {
  const result = await query<{ config: Record<string, unknown> }>(
    `SELECT config FROM integrations WHERE organization_id = $1 AND type = $2`, [orgId, type]);
  return result.rows[0].config;
}

describe.skipIf(!hasDb())('integration secrets at rest', () => {
  let org: TestOrg;
  beforeAll(async () => { org = await createTestOrg('integration-secrets'); });
  afterAll(async () => { await cleanupTestOrg(org); });

  it('should store secrets encrypted and hand them back decrypted', async () => {
    await upsertIntegration(org.id, 'SLACK', 'Slack', { botToken: 'xoxb-live', signingSecret: 'sign-live', teamId: `T-${org.slug}` });

    const stored = await storedConfig(org.id, 'SLACK');
    expect(JSON.stringify(stored)).not.toMatch(/xoxb-live|sign-live/);
    expect(stored.teamId).toBe(`T-${org.slug}`);
    expect((await getIntegrationByType(org.id, 'SLACK'))?.config).toMatchObject({ botToken: 'xoxb-live', signingSecret: 'sign-live' });
    expect((await getIntegrationBySlackTeamId(`T-${org.slug}`))?.config.botToken).toBe('xoxb-live');
  });

  it('should encrypt legacy plaintext rows, including inactive ones', async () => {
    await query(`INSERT INTO integrations (organization_id, type, name, config, is_active) VALUES
      ($1, 'LINEAR', 'Linear', '{"apiKey":"lin_plain","defaultTeamId":"t1"}', true),
      ($1, 'JIRA', 'Jira', '{"apiToken":"jira_plain","email":"a@b.c"}', false)`, [org.id]);

    const result = await reencryptIntegrationSecrets();

    expect(result.failed).toBe(0);
    expect(result.reencrypted).toBeGreaterThanOrEqual(2);
    const linear = await storedConfig(org.id, 'LINEAR');
    expect(isEncrypted(linear.apiKey)).toBe(true);
    expect(linear.defaultTeamId).toBe('t1');
    expect(isEncrypted((await storedConfig(org.id, 'JIRA')).apiToken)).toBe(true);
    expect((await getIntegrationByType(org.id, 'LINEAR'))?.config.apiKey).toBe('lin_plain');
  });
});
