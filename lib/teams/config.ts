export type TeamsCapabilityState = 'READY' | 'NOT_CONFIGURED' | 'NOT_VALIDATED'

export interface TeamsReadiness {
  notifications: TeamsCapabilityState
  commands: TeamsCapabilityState
  message: string
  approvals: 'UNSUPPORTED'
}

export function teamsReadiness(env: Record<string, string | undefined> = process.env): TeamsReadiness {
  const botConfigured = Boolean(env.TEAMS_BOT_APP_ID && env.TEAMS_BOT_APP_SECRET)
  const notifications = env.TEAMS_NOTIFICATIONS_VALIDATED === 'true' ? 'READY' : 'NOT_VALIDATED'
  const commands = botConfigured
    ? env.TEAMS_COMMANDS_VALIDATED === 'true' ? 'READY' : 'NOT_VALIDATED'
    : 'NOT_CONFIGURED'
  return {
    notifications,
    commands,
    approvals: 'UNSUPPORTED',
    message: commands === 'READY' && notifications === 'READY'
      ? 'Teams notifications and scoped commands are enabled.'
      : 'Teams capabilities remain unavailable until their deployment end-to-end validation is recorded.',
  }
}
