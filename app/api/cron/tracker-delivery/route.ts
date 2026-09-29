import { NextResponse } from 'next/server';
import { processDeliveries } from '@/lib/export/delivery';
import { log } from '@/lib/logging/logger';

export const dynamic = 'force-dynamic';

/** Every minute (vercel.json): deliver queued change requests to their tracker. */
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    log.error('cron.tracker_delivery.not_configured');
    return NextResponse.json({ error: 'Cron is not configured' }, { status: 503 });
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const result = await processDeliveries();
  if (result.processed) log.info('cron.tracker_delivery.ran', result);
  return NextResponse.json(result);
}
