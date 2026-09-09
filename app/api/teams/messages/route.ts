import { z } from 'zod'
import { bearerToken, verifyTeamsActivityToken } from '@/lib/teams/auth'
import { executeTeamsCommand, resolveTeamsActor } from '@/lib/teams/commands'
import { teamsReadiness } from '@/lib/teams/config'
import { sendTeamsReply } from '@/lib/teams/client'

const activitySchema = z.object({
  type: z.string(), id: z.string().min(1).max(500), text: z.string().max(1000).optional(),
  serviceUrl: z.url(), channelId: z.literal('msteams'),
  from: z.object({ id: z.string().min(1).max(500), aadObjectId: z.string().min(1).max(500).optional() }),
  recipient: z.object({ id: z.string() }).optional(), conversation: z.object({ id: z.string().min(1).max(1000) }),
  channelData: z.object({ tenant: z.object({ id: z.string().min(1).max(500) }) }),
  entities: z.array(z.object({
    type: z.string(), text: z.string().max(500).optional(),
    mentioned: z.object({ id: z.string().min(1).max(500), name: z.string().max(500).optional() }).optional(),
  }).passthrough()).max(100).optional(),
})
const MAX_ACTIVITY_BYTES = 256 * 1024

async function readActivity(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get('content-length') ?? 0)
  if (declared > MAX_ACTIVITY_BYTES) throw new Error('too large')
  if (!request.body) throw new Error('empty')
  const reader = request.body.getReader(), chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_ACTIVITY_BYTES) { await reader.cancel(); throw new Error('too large') }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size); let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return JSON.parse(new TextDecoder().decode(bytes))
}

function commandText(activity: z.infer<typeof activitySchema>): string {
  const text = activity.text ?? ''
  const recipientId = activity.recipient?.id
  if (!recipientId) return text
  const mention = activity.entities?.find(entity => entity.type === 'mention' && entity.mentioned?.id === recipientId)
  if (!mention) return text
  const prefix = mention.text ?? (mention.mentioned?.name ? `<at>${mention.mentioned.name}</at>` : null)
  const leading = text.trimStart()
  return prefix && leading.startsWith(prefix) ? leading.slice(prefix.length).trimStart() : text
}

export async function POST(request: Request): Promise<Response> {
  if (teamsReadiness().commands !== 'READY') return Response.json({ error: 'Teams commands are unavailable until deployment validation is complete.', code: 'TEAMS_COMMANDS_UNAVAILABLE' }, { status: 503 })
  const token = bearerToken(request.headers.get('authorization'))
  if (!token) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  let activity: z.infer<typeof activitySchema>
  try { activity = activitySchema.parse(await readActivity(request)) } catch { return Response.json({ error: 'Invalid Teams activity' }, { status: 400 }) }
  try { await verifyTeamsActivityToken(token, activity) } catch { return Response.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (activity.type !== 'message') return Response.json({ accepted: true })
  const teamsUserId = activity.from.aadObjectId ?? activity.from.id
  const actor = await resolveTeamsActor(activity.channelData.tenant.id, teamsUserId)
  if (!actor) return Response.json({ error: 'No current VPO membership is bound to this Teams identity.' }, { status: 403 })
  try {
    const response = await executeTeamsCommand({ activityId: activity.id, tenantId: activity.channelData.tenant.id, conversationId: activity.conversation.id, teamsUserId, actor, text: commandText(activity) })
    await sendTeamsReply(activity, response.text)
    return Response.json({ accepted: true, requestId: response.requestId ?? null })
  } catch {
    return Response.json({ error: 'Unable to process the Teams command safely.' }, { status: 422 })
  }
}
