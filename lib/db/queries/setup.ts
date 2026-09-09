import { query } from '@/lib/db/pool';
import { getOrganizationRole } from '@/lib/db/queries/organizations';
import { emailReadiness } from '@/lib/email/config';
import { isBlobConfigured } from '@/lib/storage/blob';
import { teamsReadiness } from '@/lib/teams/config';
import type { UserRole } from '@/lib/types/database';

export interface WorkspaceSetup {
  orgId: string;
  role: UserRole;
  dismissed: boolean;
  items: {
    workspaceNamed: boolean;
    collaboratorsAdded: boolean;
    contextAdded: boolean;
    firstRequestCreated: boolean;
  };
}

export type SetupCapabilityState = 'READY' | 'NOT_CONFIGURED' | 'UNSUPPORTED' | 'ERROR';

export interface SetupCapability {
  key: 'email' | 'jira' | 'linear' | 'github_issues' | 'slack' | 'documents' | 'teams_notifications' | 'teams_commands' | 'teams_approvals';
  label: string;
  state: SetupCapabilityState;
  message: string;
  optional: true;
  adminOnly: boolean;
  href: string | null;
}

interface SetupRow {
  organization_id: string;
  role: UserRole;
  dismissed: boolean;
  workspace_named: boolean;
  collaborators_added: boolean;
  context_added: boolean;
  first_request_created: boolean;
}

export async function getWorkspaceSetup(
  orgId: string,
  userId: string,
): Promise<WorkspaceSetup | null> {
  const result = await query<SetupRow>(
    `SELECT
       o.id AS organization_id,
       membership.role,
       (preference.dismissed_at IS NOT NULL) AS dismissed,
       (BTRIM(o.name) <> '') AS workspace_named,
       (
         (SELECT COUNT(*) FROM organization_users members WHERE members.organization_id = o.id) > 1
         OR EXISTS (
           SELECT 1 FROM organization_invitations invitation
           WHERE invitation.organization_id = o.id
             AND invitation.accepted_at IS NULL
             AND invitation.revoked_at IS NULL
             AND invitation.expires_at > NOW()
         )
       ) AS collaborators_added,
       (
         EXISTS (
           SELECT 1 FROM repositories repository
           WHERE repository.organization_id = o.id AND repository.is_active = true
         )
         OR EXISTS (
           SELECT 1 FROM objectives objective
           WHERE objective.organization_id = o.id AND objective.status = 'ACTIVE'
         )
       ) AS context_added,
       EXISTS (
         SELECT 1 FROM feature_requests request
         WHERE request.organization_id = o.id
       ) AS first_request_created
     FROM organizations o
     JOIN organization_users membership
       ON membership.organization_id = o.id AND membership.user_id = $2
     LEFT JOIN workspace_setup_preferences preference
       ON preference.organization_id = o.id AND preference.user_id = $2
     WHERE o.id = $1`,
    [orgId, userId],
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    orgId: row.organization_id,
    role: row.role,
    dismissed: row.dismissed,
    items: {
      workspaceNamed: row.workspace_named,
      collaboratorsAdded: row.collaborators_added,
      contextAdded: row.context_added,
      firstRequestCreated: row.first_request_created,
    },
  };
}

export async function setWorkspaceSetupDismissed(
  orgId: string,
  userId: string,
  dismissed: boolean,
): Promise<boolean> {
  const result = await query(
    `INSERT INTO workspace_setup_preferences (organization_id, user_id, dismissed_at)
     SELECT $1, $2, CASE WHEN $3::boolean THEN NOW() ELSE NULL END
     WHERE EXISTS (
       SELECT 1 FROM organization_users
       WHERE organization_id = $1 AND user_id = $2
     )
     ON CONFLICT (organization_id, user_id)
     DO UPDATE SET
       dismissed_at = CASE WHEN $3::boolean THEN NOW() ELSE NULL END,
       updated_at = NOW()
     RETURNING organization_id`,
    [orgId, userId, dismissed],
  );
  return result.rowCount === 1;
}

function emailCapability(): SetupCapability {
  const readiness = emailReadiness();
  if (readiness.state === 'CONFIGURED') {
    return {
      key: 'email',
      label: 'Email delivery',
      state: 'READY',
      message: 'Configured for testing. Use Settings to verify provider acceptance.',
      optional: true,
      adminOnly: false,
      href: '/settings#email',
    };
  }
  return {
    key: 'email',
    label: 'Email delivery',
    state: 'NOT_CONFIGURED',
    message: readiness.message,
    optional: true,
    adminOnly: false,
    href: '/settings#email',
  };
}

function documentCapability(): SetupCapability {
  const configured = isBlobConfigured();
  return {
    key: 'documents',
    label: 'Supporting documents',
    state: configured ? 'READY' : 'NOT_CONFIGURED',
    message: configured
      ? 'Plain text and Markdown attachments are supported. Other formats are not supported.'
      : 'Private file storage must be configured before supporting documents can be used.',
    optional: true,
    adminOnly: false,
    href: null,
  };
}

function teamsCapabilities(config: { connected: boolean; destination: boolean; identity: boolean }): SetupCapability[] {
  const readiness = teamsReadiness();
  const notificationsReady = readiness.notifications === 'READY' && config.connected && config.destination;
  const commandsReady = readiness.commands === 'READY' && config.connected && config.identity;
  return [
    {
      key: 'teams_notifications',
      label: 'Teams notifications',
      state: notificationsReady ? 'READY' : 'NOT_CONFIGURED',
      message: notificationsReady
        ? 'Validated Teams notifications are configured for selected request events.'
        : readiness.notifications !== 'READY'
          ? 'Automatic Teams notifications remain unavailable until deployed validation is recorded.'
          : 'Connect Teams and add a channel event in Settings.',
      optional: true,
      adminOnly: true,
      href: '/settings#teams',
    },
    {
      key: 'teams_commands',
      label: 'Teams commands',
      state: commandsReady ? 'READY' : 'NOT_CONFIGURED',
      message: commandsReady
        ? 'Authenticated create and status commands are enabled for bound members.'
        : readiness.commands === 'NOT_CONFIGURED'
          ? 'Teams bot credentials are not configured.'
          : readiness.commands !== 'READY'
            ? 'Teams commands remain unavailable until deployed authentication validation is recorded.'
            : 'Connect Teams and bind a Teams identity to a current workspace member.',
      optional: true,
      adminOnly: true,
      href: '/settings#teams',
    },
    {
      key: 'teams_approvals',
      label: 'Teams approvals',
      state: 'UNSUPPORTED',
      message: 'Approvals are not included in the Teams integration. Open VPO to approve or reject requests.',
      optional: true,
      adminOnly: false,
      href: null,
    },
  ];
}

function teamsErrorCapabilities(): SetupCapability[] {
  return [
    { key: 'teams_notifications', label: 'Teams notifications', state: 'ERROR', message: 'Teams readiness is temporarily unavailable.', optional: true, adminOnly: true, href: '/settings#teams' },
    { key: 'teams_commands', label: 'Teams commands', state: 'ERROR', message: 'Teams readiness is temporarily unavailable.', optional: true, adminOnly: true, href: '/settings#teams' },
    { key: 'teams_approvals', label: 'Teams approvals', state: 'UNSUPPORTED', message: 'Approvals are not included in the Teams integration. Open VPO to approve or reject requests.', optional: true, adminOnly: false, href: null },
  ];
}

export async function getWorkspaceCapabilities(
  orgId: string,
  userId: string,
): Promise<SetupCapability[]> {
  if (!await getOrganizationRole(orgId, userId)) return [];

  let activeTypes: Set<string>;
  let teamsConfig: { connected: boolean; destination: boolean; identity: boolean };
  try {
    const [result, teams] = await Promise.all([
      query<{ type: string }>(
        `SELECT type FROM integrations
         WHERE organization_id = $1 AND is_active = true`,
        [orgId],
      ),
      query<{ destination: boolean; identity: boolean }>(
        `SELECT
           EXISTS (SELECT 1 FROM teams_notifications WHERE organization_id=$1 AND is_active) AS destination,
           EXISTS (
             SELECT 1 FROM teams_identity_bindings binding
             JOIN organization_users member ON member.organization_id=binding.organization_id AND member.user_id=binding.user_id
             JOIN teams_tenants tenant ON tenant.organization_id=binding.organization_id AND tenant.tenant_id=binding.tenant_id
             WHERE binding.organization_id=$1
           ) AS identity`,
        [orgId],
      ),
    ]);
    activeTypes = new Set(result.rows.map((row) => row.type));
    teamsConfig = { connected: activeTypes.has('TEAMS'), destination: teams.rows[0].destination, identity: teams.rows[0].identity };
  } catch {
    return [
      emailCapability(),
      {
        key: 'jira',
        label: 'Jira',
        state: 'ERROR',
        message: 'Jira readiness is temporarily unavailable.',
        optional: true,
        adminOnly: true,
        href: '/settings#jira',
      },
      {
        key: 'linear',
        label: 'Linear',
        state: 'ERROR',
        message: 'Linear readiness is temporarily unavailable.',
        optional: true,
        adminOnly: true,
        href: '/settings#linear',
      },
      {
        key: 'github_issues',
        label: 'GitHub Issues',
        state: 'ERROR',
        message: 'GitHub Issues readiness is temporarily unavailable.',
        optional: true,
        adminOnly: true,
        href: '/settings#github-issues',
      },
      {
        key: 'slack',
        label: 'Slack notifications',
        state: 'ERROR',
        message: 'Collaboration readiness is temporarily unavailable.',
        optional: true,
        adminOnly: true,
        href: '/settings#slack',
      },
      documentCapability(),
      ...teamsErrorCapabilities(),
    ];
  }

  const slackReady = activeTypes.has('SLACK');
  return [
    emailCapability(),
    {
      key: 'jira',
      label: 'Jira',
      state: activeTypes.has('JIRA') ? 'READY' : 'NOT_CONFIGURED',
      message: activeTypes.has('JIRA') ? 'Jira is connected.' : 'Connect Jira only if your team uses it.',
      optional: true,
      adminOnly: true,
      href: '/settings#jira',
    },
    {
      key: 'linear',
      label: 'Linear',
      state: activeTypes.has('LINEAR') ? 'READY' : 'NOT_CONFIGURED',
      message: activeTypes.has('LINEAR') ? 'Linear is connected.' : 'Connect Linear only if your team uses it.',
      optional: true,
      adminOnly: true,
      href: '/settings#linear',
    },
    {
      key: 'github_issues',
      label: 'GitHub Issues',
      state: activeTypes.has('GITHUB_ISSUES') ? 'READY' : 'NOT_CONFIGURED',
      message: activeTypes.has('GITHUB_ISSUES')
        ? 'GitHub Issues is connected.'
        : 'Connect GitHub Issues only if your team uses it.',
      optional: true,
      adminOnly: true,
      href: '/settings#github-issues',
    },
    {
      key: 'slack',
      label: 'Slack notifications',
      state: slackReady ? 'READY' : 'NOT_CONFIGURED',
      message: slackReady
        ? 'Slack notifications are configured.'
        : 'Connect Slack only if your team wants channel notifications.',
      optional: true,
      adminOnly: true,
      href: '/settings#slack',
    },
    documentCapability(),
    ...teamsCapabilities(teamsConfig),
  ];
}
