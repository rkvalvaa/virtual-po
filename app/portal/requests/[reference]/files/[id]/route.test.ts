// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ getMyAttachment: vi.fn(), readAttachment: vi.fn() }))
vi.mock('@/lib/auth/session', () => ({ requirePortalContact: async () => ({ userId: 'u1', clientContactId: 'c1', clientAccountId: 'a1' }) }))
vi.mock('@/lib/db/queries/portal', () => ({ getMyAttachment: mocks.getMyAttachment }))
vi.mock('@/lib/storage/blob', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/blob')>()),
  readAttachment: mocks.readAttachment,
}))

import { GET } from './route'

const id = '0b8751ce-4876-4ebc-b426-d5b95dee88e4'
const call = (reference: string, fileId: string) => GET(new Request('http://localhost/x'), { params: Promise.resolve({ reference, id: fileId }) })

describe('GET /portal/requests/[reference]/files/[id]', () => {
  beforeEach(() => { mocks.getMyAttachment.mockReset(); mocks.readAttachment.mockReset() })

  it('streams the contact\'s own file privately', async () => {
    mocks.getMyAttachment.mockResolvedValue({ filename: 'plan.pdf', storageKey: 'portal/a1/f/k/plan.pdf' })
    mocks.readAttachment.mockResolvedValue({ stream: new Blob(['pdf']).stream(), contentType: 'application/pdf', size: 3 })
    const res = await call('K7M2Q9XRTA', id)
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(res.headers.get('Content-Disposition')).toContain('plan.pdf')
    expect(mocks.getMyAttachment).toHaveBeenCalledWith({ userId: 'u1', clientContactId: 'c1', clientAccountId: 'a1' }, 'K7M2Q9XRTA', id)
  })

  it('answers 404 for anything that is not the contact\'s own file', async () => {
    mocks.getMyAttachment.mockResolvedValue(null)
    expect((await call('K7M2Q9XRTA', id)).status).toBe(404)
    expect((await call('not-a-ref', id)).status).toBe(404)
    expect((await call('K7M2Q9XRTA', 'nope')).status).toBe(404)
    expect(mocks.getMyAttachment).toHaveBeenCalledTimes(1)
  })
})
