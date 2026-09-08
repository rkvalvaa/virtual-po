// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { query } from '@/lib/db/pool';
import { beginAgentRun } from '@/lib/agents/runs';
import { createIntakeTools } from './intake-tools';
import { createAssessmentTools } from './assessment-tools';
import { getFeatureRequestById } from '@/lib/db/queries/feature-requests';
import { cleanupTestOrg, createTestOrg, createTestUser, createTestRequest, hasDb, type TestOrg, type TestUser, type TestRequest } from '@/test/db-helpers';

describe.skipIf(!hasDb())('AI tool lifecycle enforcement', () => {
  let org: TestOrg;
  let owner: TestUser;
  let request: TestRequest;
  beforeAll(async () => {
    org = await createTestOrg('tool-lifecycle');
    owner = await createTestUser(org);
    request = await createTestRequest(org, owner);
  });
  beforeEach(async () => {
    await query('DELETE FROM agent_runs WHERE request_id = $1', [request.id]);
    await query("UPDATE feature_requests SET status = 'DRAFT', summary = NULL, intake_complete = false, assessment_data = NULL WHERE id = $1", [request.id]);
  });
  afterAll(async () => { await cleanupTestOrg(org, [owner.id]); });
  const toolOptions = { toolCallId: 'lifecycle-test', messages: [] };

  it('completes intake once and rejects a replay without rewriting the summary', async () => {
    const run = await beginAgentRun({ requestId: request.id, orgId: org.id, userId: owner.id, agent: 'intake' });
    const tools = createIntakeTools(request.id, org.id, owner.id, run.id);
    expect(await tools.mark_intake_complete.execute!({ summary: 'Confirmed summary' }, toolOptions)).toMatchObject({ completed: true });
    await expect(tools.mark_intake_complete.execute!({ summary: 'Replayed summary' }, toolOptions)).rejects.toMatchObject({ status: 409 });
    expect(await getFeatureRequestById(request.id)).toMatchObject({ status: 'PENDING_ASSESSMENT', summary: 'Confirmed summary', intakeComplete: true });
  });

  it('allows only one concurrent assessment write and commits scores with the status', async () => {
    await query("UPDATE feature_requests SET status = 'PENDING_ASSESSMENT', intake_complete = true WHERE id = $1", [request.id]);
    const run = await beginAgentRun({ requestId: request.id, orgId: org.id, userId: owner.id, agent: 'assessment' });
    const tools = createAssessmentTools(request.id, org.id, owner.id, run.id);
    const save = () => tools.save_assessment.execute!({ businessScore: 50, technicalScore: 40, riskScore: 30,
      priorityScore: 45, complexity: 'M', assessmentData: { rationale: 'Verified' } }, toolOptions);
    const results = await Promise.allSettled([save(), save()]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(await getFeatureRequestById(request.id)).toMatchObject({ status: 'UNDER_REVIEW', priorityScore: 45,
      complexity: 'M', assessmentData: { rationale: 'Verified' } });
  });

  it('rejects a live intake tool after requester membership is removed', async () => {
    const run = await beginAgentRun({ requestId: request.id, orgId: org.id, userId: owner.id, agent: 'intake' });
    const tools = createIntakeTools(request.id, org.id, owner.id, run.id);
    await query('DELETE FROM organization_users WHERE organization_id = $1 AND user_id = $2', [org.id, owner.id]);
    try {
      await expect(tools.mark_intake_complete.execute!({ summary: 'Should not save' }, toolOptions)).rejects.toMatchObject({ status: 403 });
      expect(await getFeatureRequestById(request.id)).toMatchObject({ status: 'INTAKE_IN_PROGRESS', summary: null });
    } finally {
      await query("INSERT INTO organization_users(organization_id, user_id, role) VALUES ($1, $2, 'STAKEHOLDER')", [org.id, owner.id]);
    }
  });
});
