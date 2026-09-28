// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ session: null as unknown }))
vi.mock('@/auth', () => ({ auth: async () => state.session }))
vi.mock('@/lib/storage/upload-authorization', () => ({
  authorizeAttachmentUpload: vi.fn(async (_actor: unknown, pathname: string) => {
    if (!pathname.startsWith('orgs/o1/requests/r1/')) throw new Error('Invalid upload path')
    return { addRandomSuffix: true }
  }),
}))
vi.mock('@vercel/blob/client', () => ({
  // Stand-in for the SDK: it asks onBeforeGenerateToken before issuing a token.
  handleUpload: vi.fn(async ({ body, onBeforeGenerateToken }) => {
    await onBeforeGenerateToken(body.payload.pathname, body.payload.clientPayload, false)
    return { type: 'blob.generate-client-token', clientToken: 'token' }
  }),
}))

import { POST } from './route'

const post = (pathname: string) => POST(new Request('http://localhost/api/attachments/upload', {
  method: 'POST',
  body: JSON.stringify({ type: 'blob.generate-client-token', payload: { pathname, clientPayload: '{"requestId":"r1"}', multipart: false } }),
}))

describe('POST /api/attachments/upload', () => {
  beforeEach(() => { process.env.BLOB_READ_WRITE_TOKEN = 'test'; state.session = { user: { id: 'u1', orgId: 'o1', role: 'STAKEHOLDER' } } })

  it('issues a token for an authorized path', async () => {
    const res = await post('orgs/o1/requests/r1/a.pdf')
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ clientToken: 'token' })
  })

  it('refuses a path the authorization rejects', async () => {
    const res = await post('orgs/o2/requests/r9/a.pdf')
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Invalid upload path' })
  })

  it('refuses a session without a workspace', async () => {
    state.session = { user: { id: 'u2', orgId: null, clientContactId: 'c1' } }
    expect((await post('orgs/o1/requests/r1/a.pdf')).status).toBe(401)
  })

  it('reports missing storage', async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN
    expect((await post('orgs/o1/requests/r1/a.pdf')).status).toBe(503)
  })
})
