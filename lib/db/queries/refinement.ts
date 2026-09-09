import { createHash } from 'node:crypto';
import { transaction, query } from '@/lib/db/pool';
import { lockAuthorizedRequest } from '@/lib/agents/runs';
import { refinementSchema, REFINEMENT_STATES, type RefinementContent } from '@/config/refinement';
import { getEpicByRequestId, getStoriesByEpicId, updateEpic, updateUserStory, createUserStory, deleteUserStory } from './epics';
import { getFeatureRequestById } from './feature-requests';
import { logActivity } from './activity-log';
import type { FeatureRequest } from '@/lib/types/database';

export interface RevisionEntry { id: string; reason: string; before: Record<string, unknown>; after: Record<string, unknown>; createdAt: string }
export interface RefinementView { content: RefinementContent; revision: string; history: RevisionEntry[]; status: string; canEdit: boolean; canReassess: boolean; exported: boolean }

async function snapshot(request: FeatureRequest) {
  const epic = await getEpicByRequestId(request.id, request.organizationId);
  const stories = epic ? await getStoriesByEpicId(epic.id, { requestId: request.id, orgId: request.organizationId }) : [];
  const content: RefinementContent = { title: request.title, summary: request.summary ?? '',
    epic: epic ? { title: epic.title, description: epic.description ?? '', goals: epic.goals ?? [], successCriteria: epic.successCriteria ?? [], technicalNotes: epic.technicalNotes ?? '' } : null,
    stories: stories.map(story => ({ id: story.id, title: story.title, asA: story.asA, iWant: story.iWant, soThat: story.soThat, acceptanceCriteria: story.acceptanceCriteria ?? [], technicalNotes: story.technicalNotes ?? '', storyPoints: story.storyPoints })),
  };
  const exports = await query('SELECT id FROM tracker_exports WHERE request_id = $1 AND organization_id = $2', [request.id, request.organizationId]);
  const exported = !!exports.rowCount || (!!epic && !!(epic.linearProjectId || epic.jiraEpicKey || epic.githubIssueNumber));
  const security = await query('SELECT * FROM security_reviews WHERE request_id = $1 AND organization_id = $2 ORDER BY created_at, id', [request.id, request.organizationId]);
  const state = { content, status: request.status, assessmentData: request.assessmentData, priorityScore: request.priorityScore,
    businessScore: request.businessScore, technicalScore: request.technicalScore, riskScore: request.riskScore, securityReviews: security.rows, updatedAt: request.updatedAt.toISOString() };
  return { content, state, epic, stories, exported, revision: createHash('sha256').update(JSON.stringify(state)).digest('hex') };
}

export async function getRefinement(requestId: string, orgId: string, userId: string): Promise<RefinementView> {
  return transaction(async () => {
    const request = await lockAuthorizedRequest({ requestId, orgId, userId, agent: 'intake' });
    const current = await snapshot(request);
    const history = await query('SELECT id, reason, before_snapshot, after_snapshot, created_at FROM request_revisions WHERE request_id = $1 AND organization_id = $2 ORDER BY created_at DESC, id DESC LIMIT 20', [requestId, orgId]);
    return { content: current.content, revision: current.revision, status: request.status, exported: current.exported,
      canEdit: REFINEMENT_STATES.includes(request.status) && !current.exported,
      canReassess: REFINEMENT_STATES.includes(request.status) && request.intakeComplete && !!request.assessmentData,
      history: history.rows.map(row => ({ id: row.id, reason: row.reason, before: row.before_snapshot, after: row.after_snapshot, createdAt: row.created_at.toISOString() })) };
  });
}

async function assertEditable(request: FeatureRequest, revision: string, current: Awaited<ReturnType<typeof snapshot>>) {
  if (!REFINEMENT_STATES.includes(request.status)) throw new Error('Work in progress, completed, or rejected requests cannot be refined.');
  if (current.revision !== revision) throw new Error('This request changed. Reload and compare your edits before saving.');
  const running = await query("SELECT id FROM agent_runs WHERE request_id = $1 AND status = 'RUNNING' AND expires_at > clock_timestamp()", [request.id]);
  if (running.rowCount) throw new Error('An AI agent is running. Wait for it to finish before editing.');
}

export async function saveRefinement(requestId: string, orgId: string, userId: string, revision: string, input: unknown): Promise<void> {
  const content = refinementSchema.parse(input);
  await transaction(async () => {
    const request = await lockAuthorizedRequest({ requestId, orgId, userId, agent: 'intake' });
    const current = await snapshot(request);
    await assertEditable(request, revision, current);
    if (current.exported) throw new Error('This content has already been exported. Edit the linked tracker content instead.');
    if (!!current.epic !== !!content.epic || (!content.epic && content.stories.length)) throw new Error('Generate an epic before refining its stories.');
    const existingIds = new Set(current.stories.map(story => story.id));
    const providedIds = content.stories.flatMap(story => story.id ? [story.id] : []);
    if (new Set(providedIds).size !== providedIds.length || providedIds.some(id => !existingIds.has(id))) throw new Error('A story does not belong to this request.');
    if (JSON.stringify(content) === JSON.stringify(current.content)) return;
    if (current.epic && content.epic) {
      await updateEpic(current.epic.id, content.epic);
      for (const [priority, story] of content.stories.entries()) {
        if (story.id) await updateUserStory(story.id, { ...story, priority });
        else await createUserStory({ ...story, storyPoints: story.storyPoints ?? undefined, priority, epicId: current.epic.id }, { requestId, orgId });
      }
      for (const story of current.stories) if (!providedIds.includes(story.id)) await deleteUserStory(story.id);
    }
    const needsAssessment = request.intakeComplete && (content.title !== request.title || content.summary !== (request.summary ?? ''));
    const status = needsAssessment ? 'PENDING_ASSESSMENT' : request.assessmentData ? 'UNDER_REVIEW' : request.status;
    await query('UPDATE feature_requests SET title = $2, summary = $3, status = $4, human_refined = human_refined OR $5, updated_at = NOW() WHERE id = $1', [requestId, content.title, content.summary, status, !!current.epic]);
    await resetReview(requestId, needsAssessment);
    await recordRevision(requestId, orgId, userId, 'Human refinement', current.state);
  });
}

export async function requestReassessment(requestId: string, orgId: string, userId: string, revision: string): Promise<void> {
  await transaction(async () => {
    const request = await lockAuthorizedRequest({ requestId, orgId, userId, agent: 'assessment' });
    const current = await snapshot(request);
    await assertEditable(request, revision, current);
    if (!request.intakeComplete || !request.assessmentData) throw new Error('Complete the initial assessment before requesting reassessment.');
    await query("UPDATE feature_requests SET status = 'PENDING_ASSESSMENT', updated_at = NOW() WHERE id = $1", [requestId]);
    await resetReview(requestId, true);
    await recordRevision(requestId, orgId, userId, 'Explicit reassessment', current.state);
  });
}

async function resetReview(requestId: string, clearAssessment: boolean) {
  // Approval decisions remain in the revision record; the active chain must run again.
  const approvals = await query('SELECT * FROM request_approvals WHERE request_id = $1', [requestId]);
  if (approvals.rowCount) await logActivity({ organizationId: (await getFeatureRequestById(requestId))!.organizationId, requestId, action: 'REQUEST_UPDATED', metadata: { previousApprovals: approvals.rows, reason: 'Refinement requires renewed review' } });
  await query('DELETE FROM request_approvals WHERE request_id = $1', [requestId]);
  if (clearAssessment) {
    await query('UPDATE feature_requests SET assessment_data = NULL, priority_score = NULL, business_score = NULL, technical_score = NULL, risk_score = NULL WHERE id = $1', [requestId]);
    await query('DELETE FROM security_reviews WHERE request_id = $1', [requestId]);
  }
}

async function recordRevision(requestId: string, orgId: string, userId: string, reason: string, before: Record<string, unknown>) {
  const after = await snapshot((await getFeatureRequestById(requestId))!);
  await query('INSERT INTO request_revisions (request_id, organization_id, author_id, reason, before_snapshot, after_snapshot) VALUES ($1, $2, $3, $4, $5, $6)', [requestId, orgId, userId, reason, before, after.state]);
  await logActivity({ organizationId: orgId, requestId, userId, action: 'REQUEST_UPDATED', entityType: 'REQUEST', entityId: requestId, metadata: { reason } });
}
