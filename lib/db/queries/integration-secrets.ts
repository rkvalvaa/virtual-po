import { query } from '@/lib/db/pool';
import { decryptConfig, encryptConfig } from '@/lib/crypto/integration-secrets';
import { log } from '@/lib/logging/logger';

/**
 * Encrypt any integration secret that is still plaintext (stored before
 * encryption) or under INTEGRATION_ENCRYPTION_KEY_PREVIOUS after a rotation.
 * Covers inactive rows too. A row changed concurrently is skipped and picked
 * up on the next run.
 */
export async function reencryptIntegrationSecrets(): Promise<{ scanned: number; reencrypted: number; failed: number }> {
  // ponytail: loads every integration row; fine for one row per org and type, page it if that grows.
  const rows = await query<{ id: string; config: Record<string, unknown> }>(`SELECT id, config FROM integrations`);
  let reencrypted = 0;
  let failed = 0;
  for (const row of rows.rows) {
    try {
      const { config, stale } = decryptConfig(row.config);
      if (!stale) continue;
      const result = await query(
        `UPDATE integrations SET config = $2 WHERE id = $1 AND config = $3::jsonb`,
        [row.id, JSON.stringify(encryptConfig(config)), JSON.stringify(row.config)],
      );
      reencrypted += result.rowCount ?? 0;
    } catch (error) {
      failed += 1;
      log.error('integration_secrets.reencrypt_failed', { integrationId: row.id, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { scanned: rows.rows.length, reencrypted, failed };
}
