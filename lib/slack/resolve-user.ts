import { getIntegrationByType } from '@/lib/db/queries/jira-sync';
import { getSlackClientFromIntegration } from '@/lib/slack/client';
import { getUserByEmail } from '@/lib/db/queries/users';
import { getOrganizationRole } from '@/lib/db/queries/organizations';
import type { Integration, User, UserRole } from '@/lib/types/database';

export type SlackUserResolution =
  | { ok: true; integration: Integration; user: User; role: UserRole | null }
  | { ok: false; reason: 'no_integration' | 'profile_lookup_failed' | 'no_account' };

/**
 * Resolve a Slack user id to a VPO user + org role: org → Slack integration
 * → Slack profile email (requires `users:read.email`) → VPO user → org role.
 * Shared by the interactions and slash-command routes.
 */
export async function resolveSlackUser(
  orgId: string,
  slackUserId: string
): Promise<SlackUserResolution> {
  const integration = await getIntegrationByType(orgId, 'SLACK');
  if (!integration) return { ok: false, reason: 'no_integration' };

  let email: string | null;
  try {
    email = await getSlackClientFromIntegration(integration).getUserEmail(slackUserId);
  } catch {
    return { ok: false, reason: 'profile_lookup_failed' };
  }

  const user = email ? await getUserByEmail(email) : null;
  if (!user) return { ok: false, reason: 'no_account' };

  const role = await getOrganizationRole(orgId, user.id);
  return { ok: true, integration, user, role };
}
