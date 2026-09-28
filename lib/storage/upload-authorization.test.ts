// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupTestOrg, createTestOrg, createTestRequest, createTestUser, hasDb, type TestOrg, type TestUser } from '@/test/db-helpers'
import { ALLOWED_MIME_TYPES, MAX_ATTACHMENT_BYTES } from './validate'
import { attachmentPrefix, authorizeAttachmentUpload } from './upload-authorization'

describe.skipIf(!hasDb())('authorizeAttachmentUpload', () => {
  let org: TestOrg
  let other: TestOrg
  let member: TestUser
  let outsider: TestUser
  let requestId: string
  let foreignRequestId: string
  beforeAll(async () => {
    org = await createTestOrg('upload-auth')
    other = await createTestOrg('upload-auth-other')
    member = await createTestUser(org, 'STAKEHOLDER')
    outsider = await createTestUser(other, 'ADMIN')
    requestId = (await createTestRequest(org, member, 'Needs a file')).id
    foreignRequestId = (await createTestRequest(other, outsider, 'Not yours')).id
  })
  afterAll(async () => {
    await cleanupTestOrg(org, [member.id])
    await cleanupTestOrg(other, [outsider.id])
  })

  const actor = () => ({ id: member.id, orgId: org.id })
  const payload = (id: string) => JSON.stringify({ requestId: id })

  it('issues a private, size- and type-limited token for a request in the member\'s workspace', async () => {
    const pathname = `${attachmentPrefix(org.id, requestId)}report.pdf`
    await expect(authorizeAttachmentUpload(actor(), pathname, payload(requestId))).resolves.toEqual({
      allowedContentTypes: [...ALLOWED_MIME_TYPES],
      maximumSizeInBytes: MAX_ATTACHMENT_BYTES,
      addRandomSuffix: true,
      tokenPayload: JSON.stringify({ requestId, userId: member.id }),
    })
  })

  it('refuses a request in another workspace, even with a matching-looking path', async () => {
    await expect(authorizeAttachmentUpload(actor(), `${attachmentPrefix(org.id, foreignRequestId)}x.pdf`, payload(foreignRequestId)))
      .rejects.toThrow('Feature request not found')
    await expect(authorizeAttachmentUpload(actor(), `${attachmentPrefix(other.id, foreignRequestId)}x.pdf`, payload(foreignRequestId)))
      .rejects.toThrow('Feature request not found')
  })

  it.each([
    ['another request\'s folder', () => `orgs/${org.id}/requests/${crypto.randomUUID()}/x.pdf`],
    ['a nested path', () => `${attachmentPrefix(org.id, requestId)}sub/x.pdf`],
    ['an unsanitized name', () => `${attachmentPrefix(org.id, requestId)}..hidden.pdf`],
    ['no file name', () => attachmentPrefix(org.id, requestId)],
  ])('refuses %s', async (_label, path) => {
    await expect(authorizeAttachmentUpload(actor(), path(), payload(requestId))).rejects.toThrow('Invalid upload path')
  })

  it('refuses a session without a workspace and a malformed payload', async () => {
    await expect(authorizeAttachmentUpload({ id: member.id, orgId: null }, `${attachmentPrefix(org.id, requestId)}x.pdf`, payload(requestId)))
      .rejects.toThrow('workspace')
    await expect(authorizeAttachmentUpload(actor(), `${attachmentPrefix(org.id, requestId)}x.pdf`, '{"requestId":"nope"}'))
      .rejects.toThrow('Invalid upload request')
  })
})
