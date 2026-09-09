// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleanupTestOrg, createTestOrg, createTestUser, hasDb, type TestOrg, type TestUser } from '@/test/db-helpers';
import { query } from '@/lib/db/pool';
import { getScoringPolicy, saveScoringPolicy } from './scoring-policy';
import { defaultScoringConfig } from '@/config/scoring';
describe.skipIf(!hasDb())('versioned organization scoring', () => {
  let org: TestOrg, admin: TestUser;
  beforeAll(async () => { org = await createTestOrg('scoring'); admin = await createTestUser(org, 'ADMIN'); });
  afterAll(async () => { await cleanupTestOrg(org, [admin.id]); });
  it('reconciles legacy agent weights and settings thresholds before saving a canonical version', async () => {
    await query('UPDATE organizations SET settings = $2 WHERE id = $1', [org.id, { scoring: { thresholds: { highPriority: 90, mediumPriority: 70 } }, keep: true }]);
    await query("INSERT INTO priority_configs (organization_id, name, framework, weights, is_default) VALUES ($1, 'Legacy', 'CUSTOM', $2, true)", [org.id, { business: 0.6, technical: 0.2, risk: 0.2 }]);
    expect(await getScoringPolicy(org.id)).toMatchObject({ version: 0, config: { framework: 'CUSTOM', weights: { business: 0.6, technical: 0.2, risk: 0.2 }, thresholds: { highPriority: 90, mediumPriority: 70 } } });
    const saved = await saveScoringPolicy(org.id, admin.id, { ...defaultScoringConfig, framework: 'WSJF' }, 0);
    expect(saved.version).toBe(1);
    expect(await getScoringPolicy(org.id)).toEqual(saved);
    await expect(saveScoringPolicy(org.id, admin.id, defaultScoringConfig, 0)).rejects.toThrow(/changed/i);
  });
  it('rejects a non-admin and invalid configuration without adding a policy version', async () => {
    await expect(saveScoringPolicy(org.id, admin.id, { ...defaultScoringConfig, weights: { business: 2, technical: 0, risk: 0 } }, 1)).rejects.toThrow();
    await query("UPDATE organization_users SET role = 'REVIEWER' WHERE user_id = $1", [admin.id]);
    await expect(saveScoringPolicy(org.id, admin.id, defaultScoringConfig, 1)).rejects.toThrow();
    expect((await getScoringPolicy(org.id)).version).toBe(1);
  });
});
