import { tool } from 'ai';
import { z } from 'zod';
import {
  updateAssessmentData,
  updateFeatureRequestStatus,
} from '@/lib/db/queries/feature-requests';
import { query } from '@/lib/db/pool';
import { mapRow, mapRows } from '@/lib/db/mappers';
import type { FeatureRequest, PriorityConfig, Complexity } from '@/lib/types/database';
import { defaultScoringConfig } from '@/config/scoring';
import { getGitHubToken, getRepoTree, getFileContent } from '@/lib/github/client';
import { getActiveRepositoriesForOrg } from '@/lib/db/queries/repositories';

export function createAssessmentTools(requestId: string, orgId: string, userId: string) {
  return {
    get_organization_context: tool({
      description:
        "Retrieve the organization's scoring configuration and priorities",
      inputSchema: z.object({}),
      execute: async () => {
        const result = await query(
          `SELECT * FROM priority_configs WHERE organization_id = $1 AND is_default = true LIMIT 1`,
          [orgId]
        );

        if (result.rows.length > 0) {
          const config = mapRow<PriorityConfig>(result.rows[0]);
          return {
            framework: config.framework,
            weights: config.weights,
            thresholds: defaultScoringConfig.thresholds,
          };
        }

        return defaultScoringConfig;
      },
    }),

    get_current_backlog: tool({
      description: 'Fetch existing backlog items for comparative analysis',
      inputSchema: z.object({}),
      execute: async () => {
        const result = await query(
          `SELECT id, title, summary, status, priority_score, business_score, technical_score, risk_score, complexity
           FROM feature_requests
           WHERE organization_id = $1
             AND status IN ('IN_BACKLOG', 'IN_PROGRESS', 'APPROVED')
           ORDER BY priority_score DESC NULLS LAST
           LIMIT 10`,
          [orgId]
        );

        const items = mapRows<
          Pick<
            FeatureRequest,
            'id' | 'title' | 'summary' | 'status' | 'priorityScore' | 'businessScore' | 'technicalScore' | 'riskScore' | 'complexity'
          >
        >(result.rows);

        return { count: items.length, items };
      },
    }),

    get_historical_estimates: tool({
      description: 'Get historical assessment data for calibration',
      inputSchema: z.object({}),
      execute: async () => {
        const result = await query(
          `SELECT id, title, complexity, priority_score, business_score, technical_score, risk_score
           FROM feature_requests
           WHERE organization_id = $1
             AND assessment_data IS NOT NULL
           ORDER BY updated_at DESC
           LIMIT 10`,
          [orgId]
        );

        const items = mapRows<
          Pick<
            FeatureRequest,
            'id' | 'title' | 'complexity' | 'priorityScore' | 'businessScore' | 'technicalScore' | 'riskScore'
          >
        >(result.rows);

        return { count: items.length, items };
      },
    }),

    analyze_codebase_impact: tool({
      description:
        'Analyze connected GitHub repositories to identify files and areas that may be impacted by this feature request. Only available when repositories are connected.',
      inputSchema: z.object({
        keywords: z
          .array(z.string())
          .describe(
            'Keywords from the feature request to search for in the codebase (e.g., component names, API endpoints, feature areas)'
          ),
      }),
      execute: async ({ keywords }) => {
        try {
          const repos = await getActiveRepositoriesForOrg(orgId);
          if (repos.length === 0) {
            return { available: false, reason: 'No repositories connected for this organization.' };
          }

          const token = await getGitHubToken(userId);
          if (!token) {
            return { available: false, reason: 'No GitHub token available. User has not connected their GitHub account.' };
          }

          const reposToScan = repos.slice(0, 3);
          const lowerKeywords = keywords.map((k) => k.toLowerCase());

          const allMatchedFiles: { repo: string; path: string; size: number }[] = [];

          for (const repo of reposToScan) {
            const tree = await getRepoTree(token, repo.owner, repo.name, repo.defaultBranch);

            const matched = tree.filter((entry) => {
              const lowerPath = entry.path.toLowerCase();
              return lowerKeywords.some((kw) => lowerPath.includes(kw));
            });

            for (const file of matched) {
              allMatchedFiles.push({
                repo: repo.fullName,
                path: file.path,
                size: file.size,
              });
            }
          }

          const topFiles = allMatchedFiles.slice(0, 10);

          const filesToFetch = topFiles
            .filter((f) => f.size <= 50 * 1024)
            .slice(0, 5);

          const fileContents: { repo: string; path: string; content: string }[] = [];

          for (const file of filesToFetch) {
            const [owner, repoName] = file.repo.split('/');
            const repo = reposToScan.find((r) => r.fullName === file.repo);
            const branch = repo?.defaultBranch ?? 'main';

            const content = await getFileContent(token, owner, repoName, file.path, branch);
            if (content) {
              fileContents.push({ repo: file.repo, path: file.path, content });
            }
          }

          return {
            available: true,
            repositories: reposToScan.map((r) => ({ name: r.fullName, branch: r.defaultBranch })),
            matchingFiles: topFiles,
            fileContents,
          };
        } catch (error) {
          return {
            available: false,
            reason: `Failed to analyze codebase: ${error instanceof Error ? error.message : 'Unknown error'}`,
          };
        }
      },
    }),

    save_assessment: tool({
      description: 'Save the complete assessment with scores and rationale',
      inputSchema: z.object({
        businessScore: z.number().min(0).max(100),
        technicalScore: z.number().min(0).max(100),
        riskScore: z.number().min(0).max(100),
        priorityScore: z.number().min(0).max(100),
        complexity: z.enum(['XS', 'S', 'M', 'L', 'XL']),
        assessmentData: z
          .record(z.string(), z.unknown())
          .describe(
            'Full assessment breakdown including executive_summary, rationale, risks, recommendations'
          ),
      }),
      execute: async ({
        businessScore,
        technicalScore,
        riskScore,
        priorityScore,
        complexity,
        assessmentData,
      }) => {
        await updateAssessmentData(requestId, assessmentData, {
          businessScore,
          technicalScore,
          riskScore,
          priorityScore,
          complexity: complexity as Complexity,
        });

        await updateFeatureRequestStatus(requestId, 'UNDER_REVIEW');

        return {
          saved: true,
          priorityScore,
          complexity,
          status: 'UNDER_REVIEW',
        };
      },
    }),
  };
}
