import { tool } from 'ai';
import { z } from 'zod';
import {
  getFeatureRequestById,
  updateFeatureRequest,
  updateFeatureRequestStatus,
  updateIntakeData,
} from '@/lib/db/queries/feature-requests';
import { query } from '@/lib/db/pool';
import { mapRows } from '@/lib/db/mappers';
import type { FeatureRequest } from '@/lib/types/database';

const INTAKE_SECTIONS = [
  'problem_statement',
  'target_users',
  'proposed_solution',
  'business_value',
  'success_metrics',
  'urgency_timeline',
  'constraints',
] as const;

export function createIntakeTools(requestId: string, orgId: string) {
  return {
    save_intake_progress: tool({
      description:
        'Save gathered information for a section of the feature request intake. Call this after collecting enough detail for a section.',
      inputSchema: z.object({
        section: z.enum(INTAKE_SECTIONS).describe('The intake section being saved'),
        data: z.record(z.string(), z.unknown()).describe('Key-value pairs of gathered information for this section'),
        completeness: z
          .number()
          .min(0)
          .max(100)
          .describe('How complete this section is, from 0 to 100'),
      }),
      execute: async ({ section, data, completeness }) => {
        const existing = await getFeatureRequestById(requestId);
        if (!existing) {
          return { error: 'Feature request not found' };
        }

        const intakeData = {
          ...existing.intakeData,
          [section]: { ...data, completeness },
        };

        await updateIntakeData(requestId, intakeData);

        return {
          saved: true,
          section,
          completeness,
        };
      },
    }),

    check_quality_score: tool({
      description:
        'Calculate the overall quality and completeness score of the intake based on which sections have been filled in. Call this periodically to assess progress.',
      inputSchema: z.object({}),
      execute: async () => {
        const request = await getFeatureRequestById(requestId);
        if (!request) {
          return { error: 'Feature request not found' };
        }

        const intakeData = request.intakeData ?? {};
        const filledSections: string[] = [];
        const missingSections: string[] = [];

        for (const section of INTAKE_SECTIONS) {
          if (intakeData[section] && Object.keys(intakeData[section] as object).length > 0) {
            filledSections.push(section);
          } else {
            missingSections.push(section);
          }
        }

        const score = Math.round(
          (filledSections.length / INTAKE_SECTIONS.length) * 100
        );

        await updateIntakeData(requestId, intakeData, score);

        return {
          score,
          filledSections,
          missingSections,
          totalSections: INTAKE_SECTIONS.length,
        };
      },
    }),

    mark_intake_complete: tool({
      description:
        'Mark the feature request intake as complete. Call this when the stakeholder confirms they are done providing information.',
      inputSchema: z.object({
        summary: z
          .string()
          .describe(
            'A concise summary of the entire feature request based on all gathered information'
          ),
      }),
      execute: async ({ summary }) => {
        await updateFeatureRequest(requestId, {
          summary,
          intakeComplete: true,
        });
        await updateFeatureRequestStatus(requestId, 'PENDING_ASSESSMENT');

        return { completed: true, nextStatus: 'PENDING_ASSESSMENT' };
      },
    }),

    get_similar_requests: tool({
      description:
        'Search for existing feature requests that may be similar or related based on keywords. Use this to check for duplicates.',
      inputSchema: z.object({
        keywords: z
          .string()
          .describe('Keywords to search for in existing feature request titles and summaries'),
      }),
      execute: async ({ keywords }) => {
        const result = await query(
          `SELECT id, title, summary, status, priority_score
           FROM feature_requests
           WHERE organization_id = $1
             AND (title ILIKE '%' || $2 || '%' OR summary ILIKE '%' || $2 || '%')
           ORDER BY created_at DESC
           LIMIT 5`,
          [orgId, keywords]
        );

        const matches = mapRows<
          Pick<FeatureRequest, 'id' | 'title' | 'summary' | 'status' | 'priorityScore'>
        >(result.rows);

        return {
          count: matches.length,
          matches: matches.map((m) => ({
            id: m.id,
            title: m.title,
            summary: m.summary,
            status: m.status,
            priorityScore: m.priorityScore,
          })),
        };
      },
    }),
  };
}
