import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  createAttachment,
  listAttachmentsByRequest,
  getAttachmentById,
  deleteAttachment,
} from './attachments'
import {
  hasDb,
  createTestOrg,
  createTestUser,
  createTestRequest,
  cleanupTestOrg,
  type TestOrg,
  type TestUser,
  type TestRequest,
} from '@/test/db-helpers'

const NONEXISTENT_ID = '00000000-0000-0000-0000-000000000000'

describe.skipIf(!hasDb())('attachments queries', () => {
  let org: TestOrg
  let user: TestUser
  let request: TestRequest
  let otherOrg: TestOrg
  let otherUser: TestUser
  let otherRequest: TestRequest

  beforeAll(async () => {
    org = await createTestOrg('attachments-test')
    user = await createTestUser(org)
    request = await createTestRequest(org, user, 'Attachment host request')

    otherOrg = await createTestOrg('attachments-other')
    otherUser = await createTestUser(otherOrg)
    otherRequest = await createTestRequest(otherOrg, otherUser, 'Their request')
  })

  afterAll(async () => {
    await cleanupTestOrg(org, [user.id])
    await cleanupTestOrg(otherOrg, [otherUser.id])
  })

  function makeParams(filename: string) {
    return {
      requestId: request.id,
      filename,
      mimeType: 'application/pdf',
      size: 1234,
      url: `https://blob.example/${filename}`,
      storageKey: `orgs/${org.id}/requests/${request.id}/${filename}-abc123`,
      uploadedBy: user.id,
    }
  }

  it('should create an attachment with its blob columns', async () => {
    const params = makeParams('spec.pdf')
    const created = await createAttachment(params)

    expect(created.id).toBeTruthy()
    expect(created.filename).toBe('spec.pdf')
    expect(created.mimeType).toBe('application/pdf')
    expect(created.size).toBe(1234)
    expect(created.storageKey).toBe(params.storageKey)
    expect(created.uploadedBy).toBe(user.id)
    expect(created.requestId).toBe(request.id)

    await deleteAttachment(created.id, org.id)
  })

  it('should list attachments for a request with the uploader name', async () => {
    const a = await createAttachment(makeParams('one.pdf'))
    const b = await createAttachment(makeParams('two.pdf'))

    const list = await listAttachmentsByRequest(request.id)
    expect(list.map((x) => x.id)).toEqual(expect.arrayContaining([a.id, b.id]))
    expect(list.every((x) => x.uploaderName !== null)).toBe(true)

    await deleteAttachment(a.id, org.id)
    await deleteAttachment(b.id, org.id)
  })

  it('should return an empty list for a request with no attachments', async () => {
    expect(await listAttachmentsByRequest(otherRequest.id)).toEqual([])
  })

  it('should join the owning organization in getAttachmentById', async () => {
    const created = await createAttachment(makeParams('joined.pdf'))
    const found = await getAttachmentById(created.id)

    expect(found?.organizationId).toBe(org.id)
    expect(found?.filename).toBe('joined.pdf')

    await deleteAttachment(created.id, org.id)
  })

  it('should return null from getAttachmentById for an unknown id', async () => {
    expect(await getAttachmentById(NONEXISTENT_ID)).toBeNull()
  })

  it('should delete an attachment scoped to its organization', async () => {
    const created = await createAttachment(makeParams('gone.pdf'))
    expect(await deleteAttachment(created.id, org.id)).toBe(true)
    expect(await getAttachmentById(created.id)).toBeNull()
  })

  it('should not delete an attachment belonging to another organization', async () => {
    const created = await createAttachment(makeParams('safe.pdf'))
    expect(await deleteAttachment(created.id, otherOrg.id)).toBe(false)
    expect(await getAttachmentById(created.id)).not.toBeNull()

    await deleteAttachment(created.id, org.id)
  })

  it('should cascade-delete attachments when the request is deleted', async () => {
    const scratchRequest = await createTestRequest(org, user, 'Doomed request')
    const created = await createAttachment({
      ...makeParams('doomed.pdf'),
      requestId: scratchRequest.id,
    })

    const { query } = await import('@/lib/db/pool')
    await query(`DELETE FROM feature_requests WHERE id = $1`, [scratchRequest.id])

    expect(await getAttachmentById(created.id)).toBeNull()
  })
})
