import { NextResponse } from 'next/server';
import { listOrganizations } from '@/lib/db/queries/organizations';
import { getLatestReviewCycle } from '@/lib/db/queries/review-cycles';
import { parseReviewCycleConfig } from '@/lib/review-cycles/config';
import { isCycleDue, runReviewCycle } from '@/lib/review-cycles/engine';
import { log } from '@/lib/logging/logger';

export const dynamic = 'force-dynamic';

/**
 * Daily sweep: start a review cycle for every org whose schedule is due.
 *
 * Vercel Cron (see vercel.json) calls this with `Authorization: Bearer
 * $CRON_SECRET`. Without the secret configured the route refuses to run at
 * all rather than exposing an unauthenticated bulk status change.
 */
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    log.error('cron.review_cycles.not_configured');
    return NextResponse.json({ error: 'Cron is not configured' }, { status: 503 });
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const ran: string[] = [];

  for (const org of await listOrganizations()) {
    const config = parseReviewCycleConfig(org.settings);
    if (!config.enabled) continue;

    const latest = await getLatestReviewCycle(org.id);
    if (!isCycleDue(config, now, latest?.startedAt ?? null)) continue;

    try {
      const cycle = await runReviewCycle({ orgId: org.id, triggeredBy: 'CRON' });
      ran.push(org.id);
      log.info('cron.review_cycles.ran', {
        orgId: org.id,
        requeued: cycle.requeuedCount,
      });
    } catch (err) {
      // One org's failure must not abort the sweep for the others.
      log.error('cron.review_cycles.failed', { orgId: org.id, err });
    }
  }

  return NextResponse.json({ ran });
}
