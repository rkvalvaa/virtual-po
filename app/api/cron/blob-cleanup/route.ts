import { NextResponse } from 'next/server';
import { isBlobConfigured } from '@/lib/storage/blob';
import { sweepOrphanBlobs } from '@/lib/storage/orphans';
import { log } from '@/lib/logging/logger';

export const dynamic = 'force-dynamic';

/**
 * Daily sweep of stored files no attachment points at (see vercel.json).
 *
 * Production only: every environment shares one Blob store, so a sweep run
 * against any other database would see production's files as unrecorded.
 */
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    log.error('cron.blob_cleanup.not_configured');
    return NextResponse.json({ error: 'Cron is not configured' }, { status: 503 });
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (process.env.VERCEL_ENV !== 'production') {
    return NextResponse.json({ error: 'Blob cleanup only runs in production' }, { status: 403 });
  }
  if (!isBlobConfigured()) {
    return NextResponse.json({ error: 'File storage is not configured' }, { status: 503 });
  }

  const result = await sweepOrphanBlobs();
  (result.complete ? log.info : log.warn)('cron.blob_cleanup.swept', { ...result });
  return NextResponse.json(result);
}
