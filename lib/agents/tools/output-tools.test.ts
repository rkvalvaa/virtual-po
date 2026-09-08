// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { query } from '@/lib/db/pool';
import { beginAgentRun } from '@/lib/agents/runs';
import { createOutputTools } from './output-tools';
import { createEpic, getStoriesByEpicId } from '@/lib/db/queries/epics';
import {
  cleanupTestOrg, createTestOrg, createTestRequest, createTestUser, hasDb,
  type TestOrg, type TestUser, type TestRequest,
} from '@/test/db-helpers';

describe.skipIf(!hasDb())('output tools tenant isolation', () => {
  let org: TestOrg;
  let otherOrg: TestOrg;
  let user: TestUser;
  let otherUser: TestUser;
  let request: TestRequest;
  let ownEpicId: string;
  let wrongRequestEpicId: string;
  let foreignEpicId: string;
  let runId: string;

  beforeAll(async () => {
    org = await createTestOrg('output-tools');
    otherOrg = await createTestOrg('output-other');
    user = await createTestUser(org);
    otherUser = await createTestUser(otherOrg);
    request = await createTestRequest(org, user);
    const wrongRequest = await createTestRequest(org, user);
    const foreignRequest = await createTestRequest(otherOrg, otherUser);
    ownEpicId = (await createEpic({ requestId: request.id, title: 'Own' })).id;
    wrongRequestEpicId = (await createEpic({ requestId: wrongRequest.id, title: 'Other request' })).id;
    foreignEpicId = (await createEpic({ requestId: foreignRequest.id, title: 'Foreign' })).id;
  });

  afterAll(async () => {
    await cleanupTestOrg(org, [user.id]);
    await cleanupTestOrg(otherOrg, [otherUser.id]);
  });

  beforeEach(async () => {
    await query('DELETE FROM user_stories WHERE epic_id = ANY($1::uuid[])',
      [[ownEpicId, wrongRequestEpicId, foreignEpicId]]);
    await query('DELETE FROM agent_runs WHERE request_id = $1', [request.id]);
    await query("UPDATE feature_requests SET status = 'UNDER_REVIEW', intake_complete = true, assessment_data = '{}' WHERE id = $1", [request.id]);
    runId = (await beginAgentRun({ requestId: request.id, orgId: org.id, userId: user.id, agent: 'output' })).id;
  });

  async function save(epicId: string, orgId = org.id) {
    const tools = createOutputTools(request.id, orgId, user.id, runId);
    return tools.save_user_story.execute!({
      epicId, title: 'Bounded story', asA: 'user', iWant: 'an authorized story',
      soThat: 'my data stays isolated', acceptanceCriteria: ['Authorized'], priority: 1,
    }, { toolCallId: 'test', messages: [] });
  }

  it('rejects a story targeting an epic in another organization without inserting it', async () => {
    expect(await save(foreignEpicId)).toMatchObject({ error: expect.any(String) });
    expect(await getStoriesByEpicId(foreignEpicId)).toHaveLength(0);
  });

  it('rejects a story targeting another request in the same organization', async () => {
    expect(await save(wrongRequestEpicId)).toMatchObject({ error: expect.any(String) });
    expect(await getStoriesByEpicId(wrongRequestEpicId)).toHaveLength(0);
  });

  it('rejects the correct epic when the trusted organization context is wrong', async () => {
    await expect(save(ownEpicId, otherOrg.id)).rejects.toMatchObject({ status: 403 });
    expect(await getStoriesByEpicId(ownEpicId)).toHaveLength(0);
  });

  it('persists a story for the authorized request and organization', async () => {
    expect(await save(ownEpicId)).toMatchObject({ saved: true });
    const stories = await getStoriesByEpicId(ownEpicId);
    expect(stories).toHaveLength(1);
    expect(stories[0]).toMatchObject({ epicId: ownEpicId, title: 'Bounded story' });
  });
});
