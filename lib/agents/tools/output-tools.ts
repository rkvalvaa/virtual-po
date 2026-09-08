import { tool } from 'ai';
import { z } from 'zod';
import { getFeatureRequestById } from '@/lib/db/queries/feature-requests';
import { createEpic, createUserStory, getEpicByRequestId, getStoriesByEpicId } from '@/lib/db/queries/epics';
import { query } from '@/lib/db/pool';
import { logActivity } from '@/lib/db/queries/activity-log';
import { guardAgentTools } from '@/lib/agents/runs';

export function createOutputTools(requestId: string, orgId: string, userId: string, runId: string) {
  return guardAgentTools({ requestId, orgId, userId, runId, agent: 'output' }, {
    get_intake_data: tool({
      description: 'Retrieve the intake data and summary for this feature request',
      inputSchema: z.object({}),
      execute: async () => {
        const request = await getFeatureRequestById(requestId);
        if (!request) {
          return { error: 'Feature request not found' };
        }
        return {
          title: request.title,
          summary: request.summary,
          intakeData: request.intakeData,
          qualityScore: request.qualityScore,
        };
      },
    }),

    get_assessment_data: tool({
      description: 'Retrieve the assessment scores and analysis for this feature request',
      inputSchema: z.object({}),
      execute: async () => {
        const request = await getFeatureRequestById(requestId);
        if (!request) {
          return { error: 'Feature request not found' };
        }
        return {
          assessmentData: request.assessmentData,
          businessScore: request.businessScore,
          technicalScore: request.technicalScore,
          riskScore: request.riskScore,
          priorityScore: request.priorityScore,
          complexity: request.complexity,
        };
      },
    }),

    save_epic: tool({
      description: 'Save the generated epic to the database',
      inputSchema: z.object({
        title: z.string().describe('Epic title'),
        description: z.string().describe('Detailed epic description'),
        goals: z.array(z.string()).describe('List of epic goals'),
        successCriteria: z.array(z.string()).describe('Measurable success criteria'),
        technicalNotes: z.string().optional().describe('Technical considerations and notes'),
      }),
      execute: async ({ title, description, goals, successCriteria, technicalNotes }) => {
        const existing = await getEpicByRequestId(requestId);
        if (existing) return { saved: true, epicId: existing.id, reused: true,
          stories: await getStoriesByEpicId(existing.id) };
        const epic = await createEpic({
          requestId,
          title,
          description,
          goals,
          successCriteria,
          technicalNotes,
        });

        try {
          await logActivity({
            organizationId: orgId,
            requestId,
            userId: null,
            action: 'EPIC_CREATED',
            entityType: 'EPIC',
            entityId: epic.id,
            metadata: { title },
          });
        } catch { /* activity logging is non-critical */ }

        return { saved: true, epicId: epic.id };
      },
    }),

    save_user_story: tool({
      description: 'Save a generated user story to the database',
      inputSchema: z.object({
        epicId: z.uuid().describe('The epic ID this story belongs to'),
        title: z.string().describe('Short story title'),
        asA: z.string().describe('The user role (As a...)'),
        iWant: z.string().describe('The desired functionality (I want...)'),
        soThat: z.string().describe('The benefit (So that...)'),
        acceptanceCriteria: z.array(z.string()).describe('Given/When/Then acceptance criteria'),
        technicalNotes: z.string().optional().describe('Technical implementation notes'),
        priority: z.number().int().min(1).describe('Priority order (1 = highest)'),
        storyPoints: z.number().int().optional().describe('Story point estimate (1,2,3,5,8,13)'),
      }),
      execute: async ({ epicId, title, asA, iWant, soThat, acceptanceCriteria, technicalNotes, priority, storyPoints }) => {
        const authorizedEpic = await getEpicByRequestId(requestId);
        if (!authorizedEpic || authorizedEpic.id !== epicId) return { error: 'Epic not found for this request' };
        const existing = (await getStoriesByEpicId(epicId)).find(story => story.title === title);
        if (existing) return { saved: true, storyId: existing.id, title: existing.title, reused: true };
        const story = await createUserStory({
          epicId,
          title,
          asA,
          iWant,
          soThat,
          acceptanceCriteria,
          technicalNotes,
          priority,
          storyPoints,
        }, { requestId, orgId });

        if (!story) return { error: 'Epic not found for this request' };

        try {
          await logActivity({
            organizationId: orgId,
            requestId,
            userId: null,
            action: 'STORY_CREATED',
            entityType: 'STORY',
            entityId: story.id,
            metadata: { title, epicId },
          });
        } catch { /* activity logging is non-critical */ }

        return { saved: true, storyId: story.id, title };
      },
    }),

    complete_output: tool({
      description: 'Call only after every planned user story has been saved. Confirms the artifact set is complete.',
      inputSchema: z.object({ storyCount: z.number().int().min(1).max(100) }),
      execute: async ({ storyCount }) => {
        const epic = await getEpicByRequestId(requestId);
        const stories = epic ? await getStoriesByEpicId(epic.id) : [];
        if (!epic || stories.length !== storyCount) return { error: 'Save the epic and all planned stories before completing output.' };
        await query('UPDATE agent_runs SET result_complete = true WHERE id = $1', [runId]);
        return { completed: true, epicId: epic.id, storyCount };
      },
    }),
  });
}
