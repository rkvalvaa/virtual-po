import {
  listFeatureRequests,
  updateFeatureRequestStatus,
} from '@/lib/db/queries/feature-requests';
import { logActivity } from '@/lib/db/queries/activity-log';
import { notifyUser } from '@/lib/db/queries/notifications';
import { getOrganizationUsers } from '@/lib/db/queries/organizations';
import {
  countRequestsUnderReview,
  insertReviewCycle,
} from '@/lib/db/queries/review-cycles';
import { canTransition } from '@/lib/utils/workflow';
import type { ReviewCycle, ReviewCycleTrigger } from '@/lib/types/database';
import type { ReviewCycleConfig } from './config';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Cap on requests re-queued in one run.
 *
 * ponytail: a plain limit, not pagination. An org with more than 500 deferred
 * requests has a backlog problem no digest fixes; page here if that changes.
 */
const MAX_REQUEUED_PER_CYCLE = 500;

/**
 * Is a cycle due right now?
 *
 * Pure, UTC, and deliberately loose on the "already ran" window (6 days for
 * WEEKLY, 27 for MONTHLY): the cron fires once a day, so the window only has
 * to be tight enough to stop a second run in the same period and loose enough
 * to survive a late or retried invocation.
 */
export function isCycleDue(
  config: ReviewCycleConfig,
  now: Date,
  lastStartedAt: Date | null
): boolean {
  if (!config.enabled) return false;

  const daysSinceLast = lastStartedAt
    ? (now.getTime() - lastStartedAt.getTime()) / DAY_MS
    : Infinity;

  if (config.cadence === 'WEEKLY') {
    if (now.getUTCDay() !== config.dayOfWeek) return false;
    return daysSinceLast >= 6;
  }

  if (now.getUTCDate() !== (config.dayOfMonth ?? 1)) return false;
  return daysSinceLast >= 27;
}

/**
 * Re-queue every DEFERRED request for review, record the cycle, and send
 * reviewers one digest notification.
 *
 * Session-free: the caller authenticates and passes `userId` for MANUAL runs.
 */
export async function runReviewCycle(params: {
  orgId: string;
  triggeredBy: ReviewCycleTrigger;
  userId?: string;
}): Promise<ReviewCycle> {
  const { orgId, triggeredBy, userId } = params;

  const { requests } = await listFeatureRequests(orgId, {
    status: 'DEFERRED',
    limit: MAX_REQUEUED_PER_CYCLE,
  });

  const requeuedRequestIds: string[] = [];
  for (const request of requests) {
    // Always true for DEFERRED today; the guard is here so a change to the
    // transition table can't turn this into an illegal bulk move.
    if (!canTransition(request.status, 'UNDER_REVIEW')) continue;

    await updateFeatureRequestStatus(request.id, 'UNDER_REVIEW');
    await logActivity({
      organizationId: orgId,
      requestId: request.id,
      userId: userId ?? null,
      action: 'STATUS_CHANGED',
      entityType: 'REQUEST',
      entityId: request.id,
      metadata: {
        from: request.status,
        to: 'UNDER_REVIEW',
        source: 'review_cycle',
      },
    });
    requeuedRequestIds.push(request.id);
  }

  const cycle = await insertReviewCycle({
    organizationId: orgId,
    requeuedRequestIds,
    triggeredBy,
    triggeredByUserId: userId ?? null,
  });

  // A cycle that re-queued nothing is still recorded (it proves the schedule
  // fired) but nobody is told — an empty digest is noise.
  if (requeuedRequestIds.length > 0) {
    const members = await getOrganizationUsers(orgId);
    const reviewers = members.filter(
      (m) => m.role === 'REVIEWER' || m.role === 'ADMIN'
    );
    const count = requeuedRequestIds.length;
    for (const member of reviewers) {
      // notifyUser also sends the email when the recipient's preferences allow.
      await notifyUser({
        organizationId: orgId,
        userId: member.userId,
        type: 'REVIEW_NEEDED',
        title: 'Review cycle started',
        message: `${count} deferred request${count === 1 ? '' : 's'} re-queued for review`,
        link: '/review',
        actorId: userId,
      });
    }
  }

  return cycle;
}

export interface CycleProgress {
  total: number;
  /** Requeued requests that have left UNDER_REVIEW (or were deleted). */
  decided: number;
}

export async function getCycleProgress(cycle: ReviewCycle): Promise<CycleProgress> {
  const total = cycle.requeuedRequestIds.length;
  if (total === 0) return { total: 0, decided: 0 };

  const stillUnderReview = await countRequestsUnderReview(cycle.requeuedRequestIds);
  return { total, decided: total - stillUnderReview };
}
