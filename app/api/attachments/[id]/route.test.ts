import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { AttachmentWithOrg } from '@/lib/db/queries/attachments'
import type { AttachmentStream } from '@/lib/storage/blob'

type FakeSession = { user: { id?: string; orgId?: string } } | null
let fakeSession: FakeSession = null

vi.mock('@/auth', () => ({
  auth: () => Promise.resolve(fakeSession),
}))

const getAttachmentById = vi.fn<(id: string) => Promise<AttachmentWithOrg | null>>()
vi.mock('@/lib/db/queries/attachments', () => ({
  getAttachmentById: (id: string) => getAttachmentById(id),
}))

const readAttachment = vi.fn<(key: string) => Promise<AttachmentStream | null>>()
vi.mock('@/lib/storage/blob', () => ({
  readAttachment: (key: string) => readAttachment(key),
}))

import { GET } from './route'

const ORG_ID = '11111111-1111-1111-1111-111111111111'
const OTHER_ORG_ID = '22222222-2222-2222-2222-222222222222'
const USER_ID = '33333333-3333-3333-3333-333333333333'
const ATTACHMENT_ID = '44444444-4444-4444-4444-444444444444'

function makeCtx(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) }
}

function makeAttachment(overrides: Partial<AttachmentWithOrg> = {}): AttachmentWithOrg {
  return {
    id: ATTACHMENT_ID,
    requestId: '55555555-5555-5555-5555-555555555555',
    filename: 'spec.pdf',
    mimeType: 'application/pdf',
    size: 42,
    url: 'https://blob.example/spec.pdf',
    storageKey: 'orgs/o/requests/r/spec.pdf-abc',
    uploadedBy: USER_ID,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    organizationId: ORG_ID,
    ...overrides,
  }
}

function makeStream(body = 'hello'): AttachmentStream {
  return {
    stream: new Response(body).body as ReadableStream<Uint8Array>,
    contentType: 'application/pdf',
    size: body.length,
  }
}

describe('GET /api/attachments/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fakeSession = { user: { id: USER_ID, orgId: ORG_ID } }
    getAttachmentById.mockResolvedValue(makeAttachment())
    readAttachment.mockResolvedValue(makeStream())
  })

  it('should return 401 when there is no session', async () => {
    fakeSession = null
    const res = await GET(new Request('http://localhost/'), makeCtx(ATTACHMENT_ID))
    expect(res.status).toBe(401)
    expect(readAttachment).not.toHaveBeenCalled()
  })

  it('should return 404 for an unknown attachment', async () => {
    getAttachmentById.mockResolvedValue(null)
    const res = await GET(new Request('http://localhost/'), makeCtx(ATTACHMENT_ID))
    expect(res.status).toBe(404)
  })

  it('should return 404 for an attachment owned by another org', async () => {
    getAttachmentById.mockResolvedValue(
      makeAttachment({ organizationId: OTHER_ORG_ID }),
    )
    const res = await GET(new Request('http://localhost/'), makeCtx(ATTACHMENT_ID))
    expect(res.status).toBe(404)
    expect(readAttachment).not.toHaveBeenCalled()
  })

  it('should return 404 when the row has no storage key', async () => {
    getAttachmentById.mockResolvedValue(makeAttachment({ storageKey: null }))
    const res = await GET(new Request('http://localhost/'), makeCtx(ATTACHMENT_ID))
    expect(res.status).toBe(404)
    expect(readAttachment).not.toHaveBeenCalled()
  })

  it('should return 404 when the blob is gone', async () => {
    readAttachment.mockResolvedValue(null)
    const res = await GET(new Request('http://localhost/'), makeCtx(ATTACHMENT_ID))
    expect(res.status).toBe(404)
  })

  it('should stream the blob with download headers', async () => {
    const res = await GET(new Request('http://localhost/'), makeCtx(ATTACHMENT_ID))

    expect(res.status).toBe(200)
    expect(readAttachment).toHaveBeenCalledWith('orgs/o/requests/r/spec.pdf-abc')
    expect(res.headers.get('Content-Type')).toBe('application/pdf')
    expect(res.headers.get('Content-Disposition')).toBe(
      `attachment; filename="spec.pdf"; filename*=UTF-8''spec.pdf`,
    )
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await res.text()).toBe('hello')
  })

  it('should RFC 5987 encode a non-ascii filename', async () => {
    getAttachmentById.mockResolvedValue(makeAttachment({ filename: 'årsrapport.pdf' }))
    const res = await GET(new Request('http://localhost/'), makeCtx(ATTACHMENT_ID))

    const disposition = res.headers.get('Content-Disposition') ?? ''
    expect(disposition).toContain(`filename="_rsrapport.pdf"`)
    expect(disposition).toContain(`filename*=UTF-8''%C3%A5rsrapport.pdf`)
  })

  it('should not let a quote in the filename break out of the header', async () => {
    getAttachmentById.mockResolvedValue(
      makeAttachment({ filename: 'evil";attachment.pdf' }),
    )
    const res = await GET(new Request('http://localhost/'), makeCtx(ATTACHMENT_ID))

    expect(res.headers.get('Content-Disposition')).toContain(
      `filename="evil_;attachment.pdf"`,
    )
  })
})
