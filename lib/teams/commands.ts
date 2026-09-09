import { query, transaction } from '@/lib/db/pool'
import { createDraft } from '@/lib/db/queries/drafts'
import { logActivity } from '@/lib/db/queries/activity-log'
import { getApplicationBaseUrl } from '@/lib/email/config'
import { z } from 'zod'

export interface TeamsActor { organizationId: string; userId: string; role: string }

export async function resolveTeamsActor(tenantId: string, teamsUserId: string): Promise<TeamsActor | null> {
  const result = await query(`SELECT b.organization_id,b.user_id,ou.role FROM teams_identity_bindings b
    JOIN teams_tenants t ON t.organization_id=b.organization_id AND t.tenant_id=b.tenant_id
    JOIN organization_users ou ON ou.organization_id=b.organization_id AND ou.user_id=b.user_id
    JOIN integrations i ON i.organization_id=b.organization_id AND i.type='TEAMS' AND i.is_active
    WHERE b.tenant_id=$1 AND b.teams_user_id=$2`, [tenantId, teamsUserId])
  return result.rows[0] ? { organizationId: result.rows[0].organization_id, userId: result.rows[0].user_id, role: result.rows[0].role } : null
}

type CommandResponse = { text: string; requestId?: string }

export async function executeTeamsCommand(input: { activityId: string; tenantId: string; conversationId: string; teamsUserId: string; actor: TeamsActor; text: string }): Promise<CommandResponse> {
  return transaction(async () => {
    const command = input.text.trim().replace(/^\/?vpo\s+/i, '')
    await query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [JSON.stringify([
      input.actor.organizationId, input.tenantId, input.conversationId, input.activityId,
    ])])
    const prior = await query(`SELECT response,command,teams_user_id FROM teams_command_receipts
      WHERE organization_id=$1 AND tenant_id=$2 AND conversation_id=$3 AND activity_id=$4 FOR UPDATE`, [input.actor.organizationId, input.tenantId, input.conversationId, input.activityId])
    if (prior.rowCount) {
      if (prior.rows[0].teams_user_id !== input.teamsUserId || prior.rows[0].command !== command) throw new Error('Teams activity replay did not match the original command identity.')
      const stillAuthorized = await query(`SELECT 1 FROM teams_identity_bindings b JOIN organization_users ou ON ou.organization_id=b.organization_id AND ou.user_id=b.user_id
        JOIN integrations i ON i.organization_id=b.organization_id AND i.type='TEAMS' AND i.is_active
        WHERE b.organization_id=$1 AND b.tenant_id=$2 AND b.teams_user_id=$3 AND b.user_id=$4 FOR SHARE OF b,ou,i`, [input.actor.organizationId, input.tenantId, input.teamsUserId, input.actor.userId])
      if (!stillAuthorized.rowCount) throw new Error('Teams identity membership was revoked.')
      if (!prior.rows[0].response) throw new Error('This Teams activity is already being processed.')
      return prior.rows[0].response as CommandResponse
    }
    const receipt = await query(`INSERT INTO teams_command_receipts(activity_id,organization_id,tenant_id,conversation_id,teams_user_id,command)
      SELECT $1,b.organization_id,b.tenant_id,$3,b.teams_user_id,$5 FROM teams_identity_bindings b
      JOIN organization_users ou ON ou.organization_id=b.organization_id AND ou.user_id=b.user_id
      JOIN integrations i ON i.organization_id=b.organization_id AND i.type='TEAMS' AND i.is_active
      WHERE b.organization_id=$2 AND b.tenant_id=$4 AND b.teams_user_id=$6 AND b.user_id=$7
      RETURNING creation_key`, [input.activityId, input.actor.organizationId, input.conversationId, input.tenantId, command, input.teamsUserId, input.actor.userId])
    if (!receipt.rowCount) throw new Error('Teams identity membership was revoked.')

    let response: CommandResponse
    if (/^create\s+/i.test(command)) {
      const title = z.string().trim().min(1).max(200).parse(command.replace(/^create\s+/i, ''))
      const draft = await createDraft({ orgId: input.actor.organizationId, userId: input.actor.userId, title, idempotencyKey: receipt.rows[0].creation_key })
      if (draft.created) await logActivity({
        organizationId: input.actor.organizationId,
        requestId: draft.requestId,
        userId: input.actor.userId,
        action: 'REQUEST_CREATED',
        entityType: 'REQUEST',
        entityId: draft.requestId,
        metadata: { title, source: 'TEAMS' },
      })
      response = { text: `Created "${title}". Continue intake: ${getApplicationBaseUrl()}/requests/${draft.requestId}`, requestId: draft.requestId }
      await query(`UPDATE teams_command_receipts SET request_id=$5,response=$6 WHERE organization_id=$1 AND tenant_id=$2 AND conversation_id=$3 AND activity_id=$4`, [input.actor.organizationId, input.tenantId, input.conversationId, input.activityId, draft.requestId, JSON.stringify(response)])
      return response
    }
    const statusMatch = /^status\s+([0-9a-f-]{36})$/i.exec(command)
    if (statusMatch) {
      const id = z.uuid().parse(statusMatch[1])
      const found = await query(`SELECT r.id,r.title,r.status FROM feature_requests r JOIN organization_users ou
        ON ou.organization_id=r.organization_id AND ou.user_id=$3 WHERE r.id=$1 AND r.organization_id=$2`, [id, input.actor.organizationId, input.actor.userId])
      response = found.rowCount
        ? { text: `${found.rows[0].title}: ${String(found.rows[0].status).replaceAll('_', ' ')} - ${getApplicationBaseUrl()}/requests/${id}`, requestId: id }
        : { text: 'Request not found in your workspace.' }
    } else if (/^(approve|reject)\b/i.test(command)) {
      response = { text: 'Approvals are unavailable in Teams. Open the request in VPO.' }
    } else {
      response = { text: 'Available commands: "vpo create <title>" and "vpo status <request UUID>". Approvals are unavailable.' }
    }
    await query(`UPDATE teams_command_receipts SET request_id=$5,response=$6 WHERE organization_id=$1 AND tenant_id=$2 AND conversation_id=$3 AND activity_id=$4`, [input.actor.organizationId, input.tenantId, input.conversationId, input.activityId, response.requestId ?? null, JSON.stringify(response)])
    return response
  })
}
