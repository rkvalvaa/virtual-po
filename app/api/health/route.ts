import { NextResponse } from 'next/server';
import { query } from '@/lib/db/pool';
import { log } from '@/lib/logging/logger';

export const dynamic = 'force-dynamic';

const VERSION = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev';

/** Unauthenticated liveness/readiness probe. Never returns error details. */
export async function GET() {
  try {
    await query('SELECT 1');
  } catch (err) {
    log.error('health.db_unreachable', { err });
    return NextResponse.json(
      { status: 'degraded', db: 'error' },
      { status: 503 }
    );
  }

  return NextResponse.json({
    status: 'ok',
    db: 'ok',
    version: VERSION,
    uptimeSec: Math.round(process.uptime()),
  });
}
