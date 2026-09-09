// @vitest-environment node
import { expect, it } from 'vitest';
import { cleanupTestOrg, createTestOrg, createTestUser, createTestRequest, hasDb } from '@/test/db-helpers';
import { query } from '@/lib/db/pool';
import { defaultScoringConfig } from '@/config/scoring';
import { getPriorityDistribution } from './analytics';

it.skipIf(!hasDb())('analytics bands use each historical policy and legacy fallback', async () => {
  const org = await createTestOrg(), user = await createTestUser(org);
  try {
    for (const [index, policy] of [null, { version: 1, config: { ...defaultScoringConfig, thresholds: { highPriority: 90, mediumPriority: 70 } } }, { invalid: true }].entries()) {
      const request = await createTestRequest(org, user, `Policy ${index}`);
      await query('UPDATE feature_requests SET priority_score=80, assessment_data=$2 WHERE id=$1', [request.id, { scoringPolicy: policy }]);
    }
    expect(await getPriorityDistribution(org.id)).toEqual([{ band: 'High', count: 2 }, { band: 'Medium', count: 1 }]);
  } finally { await cleanupTestOrg(org, [user.id]); }
});
