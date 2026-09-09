// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { cleanupTestOrg, createTestOrg, createTestUser, createTestRequest, hasDb, type TestOrg } from '@/test/db-helpers';
import { createEpic, createUserStory, getStoriesByEpicId } from './epics';
import { query } from '@/lib/db/pool';
import { getRefinement, saveRefinement, requestReassessment } from './refinement';
import { getFeatureRequestById } from './feature-requests';
import { beginAgentRun } from '@/lib/agents/runs';
import { createIntakeTools } from '@/lib/agents/tools/intake-tools';

describe.skipIf(!hasDb())('human request refinement', () => {
  const fixtures: { org: TestOrg; users: string[] }[] = [];
  async function setup() {
    const org = await createTestOrg('refinement'), owner = await createTestUser(org), reviewer = await createTestUser(org, 'REVIEWER');
    fixtures.push({ org, users: [owner.id, reviewer.id] });
    const request = await createTestRequest(org, owner, 'Original title');
    await query("UPDATE feature_requests SET status = 'APPROVED', intake_complete = true, assessment_data = $2, priority_score = 80 WHERE id = $1", [request.id, { executive_summary: 'Original assessment' }]);
    const epic = await createEpic({ requestId: request.id, title: 'Original epic' });
    await createUserStory({ epicId: epic.id, title: 'Original story', asA: 'user', iWant: 'feature', soThat: 'benefit' }, { requestId: request.id, orgId: org.id });
    return { org, owner, reviewer, request, epic };
  }
  afterEach(async () => { for (const { org, users } of fixtures.splice(0)) await cleanupTestOrg(org, users); });
  it('edits generated text, criteria, estimates and order, adds/removes stories, and retains revision history', async () => {
    const f = await setup();
    const view = await getRefinement(f.request.id, f.org.id, f.reviewer.id);
    const data = { ...view.content, epic: { ...view.content.epic!, title: 'Human epic' }, stories: [{ title: 'New first story', asA: 'reviewer', iWant: 'editable output', soThat: 'I can refine', acceptanceCriteria: ['Persists after reload'], technicalNotes: 'Use transactions', storyPoints: 5 }] };
    await saveRefinement(f.request.id, f.org.id, f.reviewer.id, view.revision, data);
    const updated = await getRefinement(f.request.id, f.org.id, f.reviewer.id);
    expect(updated.content).toMatchObject({ epic: { title: 'Human epic' }, stories: [{ title: 'New first story', storyPoints: 5, acceptanceCriteria: ['Persists after reload'] }] });
    expect((await getStoriesByEpicId(f.epic.id))).toHaveLength(1);
    expect(await getFeatureRequestById(f.request.id)).toMatchObject({ status: 'UNDER_REVIEW', humanRefined: true });
    expect(updated.history).toHaveLength(1);
    expect(updated.history[0].before).toMatchObject({ content: { epic: { title: 'Original epic' } } });
    await expect(beginAgentRun({ requestId: f.request.id, orgId: f.org.id, userId: f.reviewer.id, agent: 'output' })).rejects.toThrow(/human/i);
  });
  it('detects stale concurrent edits without losing the first revision', async () => {
    const f = await setup(); const view = await getRefinement(f.request.id, f.org.id, f.owner.id);
    await saveRefinement(f.request.id, f.org.id, f.owner.id, view.revision, { ...view.content, title: 'Changed title' });
    await expect(saveRefinement(f.request.id, f.org.id, f.owner.id, view.revision, { ...view.content, title: 'Stale title' })).rejects.toThrow(/changed/i);
    expect(await getFeatureRequestById(f.request.id)).toMatchObject({ title: 'Changed title', status: 'PENDING_ASSESSMENT', priorityScore: null });
  });
  it('rejects foreign requests, unrelated stakeholders and foreign story IDs', async () => {
    const f = await setup(), other = await setup();
    await expect(getRefinement(f.request.id, other.org.id, other.owner.id)).rejects.toThrow();
    const stranger = await createTestUser(f.org); fixtures[0].users.push(stranger.id);
    await expect(getRefinement(f.request.id, f.org.id, stranger.id)).rejects.toThrow();
    const view = await getRefinement(f.request.id, f.org.id, f.owner.id);
    const foreignStory = (await getStoriesByEpicId(other.epic.id))[0];
    await expect(saveRefinement(f.request.id, f.org.id, f.owner.id, view.revision, { ...view.content, stories: [{ ...view.content.stories[0], id: foreignStory.id }] })).rejects.toThrow();
    expect((await getStoriesByEpicId(other.epic.id))[0].title).toBe('Original story');
  });
  it('explicitly queues reassessment and retains the old assessment in history', async () => {
    const f = await setup(); const view = await getRefinement(f.request.id, f.org.id, f.reviewer.id);
    await requestReassessment(f.request.id, f.org.id, f.reviewer.id, view.revision);
    expect(await getFeatureRequestById(f.request.id)).toMatchObject({ status: 'PENDING_ASSESSMENT', assessmentData: null, priorityScore: null });
    const result = await getRefinement(f.request.id, f.org.id, f.reviewer.id);
    expect(result.history[0].before).toMatchObject({ assessmentData: { executive_summary: 'Original assessment' } });
  });
  it('preserves an explicitly edited summary when intake completes', async () => {
    const f = await setup();
    const request = await createTestRequest(f.org, f.owner);
    const view = await getRefinement(request.id, f.org.id, f.owner.id);
    await saveRefinement(request.id, f.org.id, f.owner.id, view.revision, { ...view.content, summary: 'Accepted human summary' });
    const run = await beginAgentRun({ requestId: request.id, orgId: f.org.id, userId: f.owner.id, agent: 'intake' });
    const tools = createIntakeTools(request.id, f.org.id, f.owner.id, run.id);
    await tools.mark_intake_complete.execute!({ summary: 'AI replacement' }, { toolCallId: 'test', messages: [] });
    expect(await getFeatureRequestById(request.id)).toMatchObject({ summary: 'Accepted human summary', intakeComplete: true });
  });
});
