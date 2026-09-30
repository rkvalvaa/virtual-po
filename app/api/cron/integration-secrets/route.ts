import { NextResponse } from 'next/server';
import { reencryptIntegrationSecrets } from '@/lib/db/queries/integration-secrets';
import { log } from '@/lib/logging/logger';

export const dynamic = 'force-dynamic';

/**
 * Daily pass that encrypts plaintext integration secrets and moves secrets off
 * INTEGRATION_ENCRYPTION_KEY_PREVIOUS after a key rotation (see vercel.json).
 * Run it by hand right after deploying a new key instead of waiting a day.
 */
export async function GET(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    log.error('cron.integration_secrets.not_configured');
    return NextResponse.json({ error: 'Cron is not configured' }, { status: 503 });
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await reencryptIntegrationSecrets();
  (result.failed ? log.error : log.info)('cron.integration_secrets.reencrypted', { ...result });
  return NextResponse.json(result, { status: result.failed ? 500 : 200 });
}
