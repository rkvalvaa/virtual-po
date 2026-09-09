import { NextResponse } from 'next/server'
import { log } from '@/lib/logging/logger'
import { runDueLinearStatusSyncs } from '@/lib/status-sync/linear'

export const dynamic = 'force-dynamic'

export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    log.error('cron.tracker_status_sync.not_configured')
    return NextResponse.json({ error: 'Cron is not configured' }, { status: 503 })
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const outcomes = await runDueLinearStatusSyncs()
  const failed = outcomes.filter(outcome => !outcome.success).length
  return NextResponse.json({ processed: outcomes.length, succeeded: outcomes.length - failed, failed })
}
