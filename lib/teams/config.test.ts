import { describe, expect, it } from 'vitest'
import { teamsReadiness } from './config'

describe('Teams readiness', () => {
  it('does not enable capabilities merely because credentials exist', () => {
    expect(teamsReadiness({ TEAMS_BOT_APP_ID: 'id', TEAMS_BOT_APP_SECRET: 'secret' })).toMatchObject({ commands: 'NOT_VALIDATED', notifications: 'NOT_VALIDATED', approvals: 'UNSUPPORTED' })
  })
  it('enables each capability only with its explicit deployment validation', () => {
    expect(teamsReadiness({ TEAMS_BOT_APP_ID: 'id', TEAMS_BOT_APP_SECRET: 'secret', TEAMS_COMMANDS_VALIDATED: 'true', TEAMS_NOTIFICATIONS_VALIDATED: 'true' })).toMatchObject({ commands: 'READY', notifications: 'READY' })
  })
})
