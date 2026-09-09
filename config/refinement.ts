import { z } from 'zod';
const text = z.string().max(20000);
const title = z.string().trim().min(1).max(200);
const lines = z.array(z.string().trim().min(1).max(2000)).max(100);
export const refinementSchema = z.object({
  title, summary: text,
  epic: z.object({ title, description: text, goals: lines, successCriteria: lines, technicalNotes: text }).nullable(),
  stories: z.array(z.object({ id: z.uuid().optional(), title, asA: z.string().trim().min(1).max(2000), iWant: z.string().trim().min(1).max(4000), soThat: z.string().trim().min(1).max(4000), acceptanceCriteria: lines, technicalNotes: text, storyPoints: z.number().int().min(0).max(1000).nullable() })).max(100),
});
export type RefinementContent = z.infer<typeof refinementSchema>;
export const REFINEMENT_STATES = ['DRAFT', 'INTAKE_IN_PROGRESS', 'PENDING_ASSESSMENT', 'UNDER_REVIEW', 'APPROVED', 'NEEDS_INFO', 'DEFERRED', 'IN_BACKLOG'];
