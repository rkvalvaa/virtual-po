import { tool } from 'ai';
import { z } from 'zod';
import { getFeatureRequestById, updateFeatureRequest } from '@/lib/db/queries/feature-requests';
import { createSecurityReview } from '@/lib/db/queries/security-reviews';
import {
  SECURITY_CATEGORIES,
  SECURITY_TAG,
  getHighestSeverity,
  type SecuritySeverity,
} from '@/config/security-categories';

export function createSecurityTools(requestId: string, orgId: string) {
  return {
    get_request_context: tool({
      description:
        'Retrieve the full feature request context including title, summary, intake data, and assessment data for security analysis',
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
          assessmentData: request.assessmentData,
          tags: request.tags,
          complexity: request.complexity,
          riskScore: request.riskScore,
        };
      },
    }),

    save_security_review: tool({
      description:
        'Save the security review findings, tag the feature request, and persist the review for downstream consumers (devs, devops, security team)',
      inputSchema: z.object({
        categories: z
          .array(
            z.object({
              id: z.string().describe('Security category ID (e.g., "pii", "auth", "authz")'),
              severity: z.enum(['critical', 'high', 'medium', 'low']),
              reasoning: z.string().describe('Brief explanation of why this category was flagged'),
              recommendations: z
                .array(z.string())
                .describe('Specific security recommendations for this category'),
            })
          )
          .describe('Array of matched security categories with reasoning'),
        overallSeverity: z
          .enum(['critical', 'high', 'medium', 'low', 'none'])
          .describe('Highest severity from matched categories, or "none" if no concerns'),
        summary: z
          .string()
          .describe('2-3 sentence executive summary of the security implications'),
        recommendations: z
          .array(z.string())
          .describe('Top-level actionable security recommendations'),
        requiresSecurityReview: z
          .boolean()
          .describe('True if any category matched at medium severity or above'),
        gaps: z
          .array(z.string())
          .describe('Information gaps that need clarification from a security perspective'),
      }),
      execute: async ({
        categories,
        overallSeverity,
        summary,
        recommendations,
        requiresSecurityReview,
        gaps,
      }) => {
        // Validate category IDs against known categories
        const validCategoryIds = new Set(SECURITY_CATEGORIES.map((c) => c.id));
        const validatedCategories = categories.filter((c) => validCategoryIds.has(c.id));

        // Calculate severity from actual findings
        const severities = validatedCategories.map((c) => c.severity as SecuritySeverity);
        const computedSeverity = severities.length > 0 ? getHighestSeverity(severities) : 'none';

        // Build tags to add to the feature request
        const securityTags: string[] = [];
        if (requiresSecurityReview) {
          securityTags.push(SECURITY_TAG);
          for (const cat of validatedCategories) {
            securityTags.push(`security:${cat.id}`);
          }
        }

        // Update feature request tags (merge with existing, deduplicate)
        const request = await getFeatureRequestById(requestId);
        if (request) {
          const existingTags = request.tags ?? [];
          const mergedTags = [...new Set([...existingTags, ...securityTags])];
          await updateFeatureRequest(requestId, { tags: mergedTags });
        }

        // Persist the security review
        const review = await createSecurityReview({
          requestId,
          organizationId: orgId,
          categories: validatedCategories,
          overallSeverity: computedSeverity === 'none' ? overallSeverity : computedSeverity,
          summary,
          recommendations,
          requiresSecurityReview,
          gaps,
        });

        return {
          saved: true,
          reviewId: review.id,
          tagsAdded: securityTags,
          overallSeverity: computedSeverity === 'none' ? overallSeverity : computedSeverity,
          requiresSecurityReview,
          categoriesMatched: validatedCategories.length,
        };
      },
    }),
  };
}
