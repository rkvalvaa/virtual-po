import { query, transaction } from '@/lib/db/pool';
import { lockOrganizationAdmin } from '@/lib/auth/organization-admin';
import { defaultScoringConfig } from '@/config/scoring';
import { scoringConfigSchema, type ScoringPolicy } from '@/config/scoring-policy';
import { logActivity } from './activity-log';

export async function getScoringPolicy(orgId: string): Promise<ScoringPolicy> {
  const current = await query('SELECT version, config FROM scoring_policy_versions WHERE organization_id = $1 ORDER BY version DESC LIMIT 1', [orgId]);
  if (current.rowCount) return { version: current.rows[0].version, config: scoringConfigSchema.parse(current.rows[0].config) };
  const legacy = await query(`SELECT o.settings->'scoring' AS settings, p.framework, p.weights FROM organizations o
    LEFT JOIN LATERAL (SELECT framework, weights FROM priority_configs WHERE organization_id = o.id AND is_default = true ORDER BY updated_at DESC, id LIMIT 1) p ON true
    WHERE o.id = $1`, [orgId]);
  if (!legacy.rowCount) throw new Error('Organization not found.');
  const row = legacy.rows[0];
  const merged = { framework: row.framework ?? row.settings?.framework ?? defaultScoringConfig.framework,
    weights: row.weights ?? row.settings?.weights ?? defaultScoringConfig.weights,
    thresholds: row.settings?.thresholds ?? defaultScoringConfig.thresholds };
  const parsed = scoringConfigSchema.safeParse(merged);
  return { version: 0, config: parsed.success ? parsed.data : defaultScoringConfig };
}

export async function saveScoringPolicy(orgId: string, actorId: string, input: unknown, expectedVersion: number): Promise<ScoringPolicy> {
  const config = scoringConfigSchema.parse(input);
  return transaction(async () => {
    await lockOrganizationAdmin(orgId, actorId);
    const previous = await getScoringPolicy(orgId);
    if (expectedVersion !== previous.version) throw new Error('Scoring configuration changed. Reload settings before saving.');
    const version = previous.version + 1;
    await query('INSERT INTO scoring_policy_versions (organization_id, version, config, created_by) VALUES ($1, $2, $3, $4)', [orgId, version, config, actorId]);
    await logActivity({ organizationId: orgId, userId: actorId, action: 'ORGANIZATION_UPDATED', entityType: 'ORGANIZATION', entityId: orgId, metadata: { scoringVersion: version, previousConfig: previous.config, config } });
    return { version, config };
  });
}
