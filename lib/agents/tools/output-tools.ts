import { tool } from 'ai';
import { z } from 'zod';
import { getFeatureRequestById } from '@/lib/db/queries/feature-requests';
import { createEpic, createUserStory } from '@/lib/db/queries/epics';

export function createOutputTools(requestId: string) {
  return {
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
        const epic = await createEpic({
          requestId,
          title,
          description,
          goals,
          successCriteria,
          technicalNotes,
        });
        return { saved: true, epicId: epic.id };
      },
    }),

    save_user_story: tool({
      description: 'Save a generated user story to the database',
      inputSchema: z.object({
        epicId: z.string().describe('The epic ID this story belongs to'),
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
        });
        return { saved: true, storyId: story.id, title };
      },
    }),
  };
}
