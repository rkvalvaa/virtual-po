// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanupTestOrg, createTestOrg, createTestRequest, createTestUser, hasDb, type TestOrg, type TestUser } from '@/test/db-helpers'
import { query } from '@/lib/db/pool'
import { attachmentPrefix } from '@/lib/storage/upload-authorization'

const actor = vi.hoisted(() => ({ id: '', orgId: '', role: 'STAKEHOLDER' }))
const blob = vi.hoisted(() => ({ head: vi.fn(), del: vi.fn() }))
vi.mock('@/lib/auth/session', () => ({ requireAuth: async () => ({ user: actor }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@vercel/blob', () => ({ head: blob.head, del: blob.del, get: vi.fn(), BlobNotFoundError: class extends Error {} }))

import { recordUploadedAttachment } from './attachment-actions'

describe.skipIf(!hasDb())('recordUploadedAttachment', () => {
  let org: TestOrg
  let member: TestUser
  let requestId: string
  beforeAll(async () => {
    process.env.BLOB_READ_WRITE_TOKEN = 'test-token'
    org = await createTestOrg('record-upload')
    member = await createTestUser(org, 'STAKEHOLDER')
    requestId = (await createTestRequest(org, member, 'With files')).id
  })
  beforeEach(() => {
    Object.assign(actor, { id: member.id, orgId: org.id })
    blob.head.mockReset()
    blob.del.mockReset()
  })
  afterAll(async () => { delete process.env.BLOB_READ_WRITE_TOKEN; await cleanupTestOrg(org, [member.id]) })

  const stored = (pathname: string, overrides: object = {}) => ({
    pathname, url: `https://blob.example/${pathname}`, contentType: 'application/pdf', size: 9 * 1024 * 1024, ...overrides,
  })

  it('records the blob with the size and type the store reports, once', async () => {
    const pathname = `${attachmentPrefix(org.id, requestId)}report-AbC123.pdf`
    blob.head.mockResolvedValue(stored(pathname))
    expect(await recordUploadedAttachment(requestId, pathname, 'report.pdf')).toEqual({ success: true })
    expect(await recordUploadedAttachment(requestId, pathname, 'report.pdf')).toEqual({ success: true })

    const rows = await query('SELECT filename, mime_type, size, storage_key, uploaded_by FROM attachments WHERE request_id = $1', [requestId])
    expect(rows.rows).toEqual([{ filename: 'report.pdf', mime_type: 'application/pdf', size: 9 * 1024 * 1024, storage_key: pathname, uploaded_by: member.id }])
  })

  it('refuses a pathname outside this request', async () => {
    const result = await recordUploadedAttachment(requestId, `orgs/${org.id}/requests/${crypto.randomUUID()}/x.pdf`, 'x.pdf')
    expect(result).toEqual({ success: false, errors: ['x.pdf: upload failed'] })
    expect(blob.head).not.toHaveBeenCalled()
  })

  it('deletes and refuses a stored blob that breaks the type or size rules', async () => {
    const pathname = `${attachmentPrefix(org.id, requestId)}big-XyZ.pdf`
    blob.head.mockResolvedValue(stored(pathname, { size: 11 * 1024 * 1024 }))
    const result = await recordUploadedAttachment(requestId, pathname, 'big.pdf')
    expect(result.success).toBe(false)
    expect(blob.del).toHaveBeenCalledWith(pathname)
    expect((await query('SELECT 1 FROM attachments WHERE storage_key = $1', [pathname])).rowCount).toBe(0)
  })
})
