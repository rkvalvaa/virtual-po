// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from './route'
import { verifyTeamsActivityToken } from '@/lib/teams/auth'
import { executeTeamsCommand, resolveTeamsActor } from '@/lib/teams/commands'
import { sendTeamsReply } from '@/lib/teams/client'

vi.mock('@/lib/teams/auth', () => ({ bearerToken: (header: string | null) => header?.replace('Bearer ', '') ?? null, verifyTeamsActivityToken: vi.fn() }))
vi.mock('@/lib/teams/commands', () => ({ resolveTeamsActor: vi.fn(), executeTeamsCommand: vi.fn() }))
vi.mock('@/lib/teams/client', () => ({ sendTeamsReply: vi.fn() }))

const body = { type: 'message', id: 'activity-1', text: 'vpo create Keep My Title', serviceUrl: 'https://smba.trafficmanager.net/teams', channelId: 'msteams',
  from: { id: 'opaque-teams-user', name: 'Ignored', aadObjectId: 'aad-user-id' }, recipient: { id: 'bot' }, conversation: { id: 'conversation' },
  channelData: { tenant: { id: 'signed-tenant-body' } } }
const request = (value = body) => new Request('https://example.test/api/teams/messages', { method: 'POST', headers: { authorization: 'Bearer signed-token', 'content-type': 'application/json' }, body: JSON.stringify(value) })

describe('Teams Bot Framework ingress', () => {
  beforeEach(() => {
    vi.stubEnv('TEAMS_BOT_APP_ID', 'app-id'); vi.stubEnv('TEAMS_BOT_APP_SECRET', 'secret'); vi.stubEnv('TEAMS_COMMANDS_VALIDATED', 'true')
    vi.mocked(resolveTeamsActor).mockResolvedValue({ organizationId: 'org', userId: 'user', role: 'STAKEHOLDER' })
    vi.mocked(executeTeamsCommand).mockResolvedValue({ text: 'Created', requestId: 'request-id' })
  })
  afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks() })

  it('keeps commands truthfully unavailable until deployment validation', async () => {
    vi.stubEnv('TEAMS_COMMANDS_VALIDATED', 'false')
    expect((await POST(request())).status).toBe(503)
    expect(verifyTeamsActivityToken).not.toHaveBeenCalled()
  })

  it('authenticates the connector token and resolves only stable tenant/user identities', async () => {
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect(verifyTeamsActivityToken).toHaveBeenCalledWith('signed-token', expect.objectContaining({ serviceUrl: body.serviceUrl }))
    expect(resolveTeamsActor).toHaveBeenCalledWith('signed-tenant-body', 'aad-user-id')
    expect(executeTeamsCommand).toHaveBeenCalledWith(expect.objectContaining({ text: body.text, teamsUserId: 'aad-user-id' }))
    expect(sendTeamsReply).toHaveBeenCalledWith(expect.objectContaining({ id: 'activity-1' }), 'Created')
  })

  it('removes only a leading mention that targets the authenticated bot recipient', async () => {
    const mentioned = { ...body, text: '<at>Virtual PO</at> create Channel request',
      entities: [{ type: 'mention', text: '<at>Virtual PO</at>', mentioned: { id: 'bot', name: 'Virtual PO' } }] }
    expect((await POST(request(mentioned))).status).toBe(200)
    expect(executeTeamsCommand).toHaveBeenCalledWith(expect.objectContaining({ text: 'create Channel request' }))

    vi.mocked(executeTeamsCommand).mockClear()
    const someoneElse = { ...mentioned,
      entities: [{ type: 'mention', text: '<at>Virtual PO</at>', mentioned: { id: 'different-user', name: 'Virtual PO' } }] }
    expect((await POST(request(someoneElse))).status).toBe(200)
    expect(executeTeamsCommand).toHaveBeenCalledWith(expect.objectContaining({ text: '<at>Virtual PO</at> create Channel request' }))
  })

  it('rejects unknown identity bindings without executing commands', async () => {
    vi.mocked(resolveTeamsActor).mockResolvedValue(null)
    expect((await POST(request())).status).toBe(403)
    expect(executeTeamsCommand).not.toHaveBeenCalled()
  })

  it('bounds streamed activity bodies before JSON parsing', async () => {
    const chunk = new Uint8Array(150 * 1024)
    const stream = new ReadableStream({ start(controller) { controller.enqueue(chunk); controller.enqueue(chunk); controller.close() } })
    const oversized = new Request('https://example.test/api/teams/messages', { method: 'POST', headers: { authorization: 'Bearer signed-token' }, body: stream, duplex: 'half' } as RequestInit & { duplex: 'half' })
    expect((await POST(oversized)).status).toBe(400)
    expect(verifyTeamsActivityToken).not.toHaveBeenCalled()
  })
})
