import { z } from 'zod';

/**
 * Recurring review cycle settings, stored on `organizations.settings.reviewCycle`.
 *
 * JSONB rather than columns: it is one small per-org blob that only the
 * settings tab writes and only the cron reads.
 */
export const reviewCycleConfigSchema = z.object({
  enabled: z.boolean(),
  cadence: z.enum(['WEEKLY', 'MONTHLY']),
  /** 0 = Sunday .. 6 = Saturday, UTC. Only read when cadence is WEEKLY. */
  dayOfWeek: z.number().int().min(0).max(6).default(1),
  // Capped at 28 so a monthly cycle never silently skips February.
  dayOfMonth: z.number().int().min(1).max(28).optional(),
});

export type ReviewCycleConfig = z.infer<typeof reviewCycleConfigSchema>;

export const DEFAULT_REVIEW_CYCLE_CONFIG: ReviewCycleConfig = {
  enabled: false,
  cadence: 'WEEKLY',
  dayOfWeek: 1,
};

/**
 * Read the cycle config out of an org's settings blob.
 *
 * Anything unparseable falls back to the disabled default — a malformed blob
 * must never make the cron re-queue on a schedule nobody configured.
 */
export function parseReviewCycleConfig(settings: unknown): ReviewCycleConfig {
  const raw = (settings as Record<string, unknown> | null | undefined)?.reviewCycle;
  const parsed = reviewCycleConfigSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_REVIEW_CYCLE_CONFIG;
}
