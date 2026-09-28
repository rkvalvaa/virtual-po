// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupTestOrg, createTestOrg, createTestUser, hasDb, type TestOrg, type TestUser } from '@/test/db-helpers'
import { addClientContact, createClientAccount } from '@/lib/db/queries/client-accounts'
import { createForm, publishForm, saveFormDraft, setFormPaused } from '@/lib/db/queries/intake-forms'
import { ALLOWED_MIME_TYPES, MAX_ATTACHMENT_BYTES } from './validate'
import { authorizePortalUpload, portalStagingPrefix } from './portal-upload-authorization'

describe.skipIf(!hasDb())('authorizePortalUpload', () => {
  let org: TestOrg
  let admin: TestUser
  let clientId: string
  let otherClientId: string
  let formId: string
  let noFilesFormId: string
  let otherClientFormId: string
  const key = crypto.randomUUID()

  async function publish(clientAccountId: string, maxAttachments: number) {
    const { id } = await createForm(org.id, admin.id, clientAccountId, 'Upload form')
    await saveFormDraft(org.id, admin.id, id, {
      title: 'Upload form', instructions: '', titleFieldKey: 'summary', maxAttachments,
      fields: [{ key: 'summary', label: 'Summary', type: 'TEXT', required: true, options: [], showIf: null }],
    })
    await publishForm(org.id, admin.id, id)
    return id
  }

  beforeAll(async () => {
    org = await createTestOrg('portal-upload')
    admin = await createTestUser(org, 'ADMIN')
    clientId = (await createClientAccount(org.id, admin.id, 'Uploading client')).id
    otherClientId = (await createClientAccount(org.id, admin.id, 'Other client')).id
    await addClientContact(org.id, admin.id, clientId, `uploader-${crypto.randomUUID()}@client.example`)
    formId = await publish(clientId, 2)
    noFilesFormId = await publish(clientId, 0)
    otherClientFormId = await publish(otherClientId, 3)
  })
  afterAll(async () => cleanupTestOrg(org, [admin.id]))

  const contact = () => ({ userId: admin.id, clientContactId: crypto.randomUUID(), clientAccountId: clientId })
  const payload = (form: string, submissionKey = key) => JSON.stringify({ formId: form, submissionKey })

  it('issues a limited token for a staged file on a form published to the contact\'s client', async () => {
    const pathname = `${portalStagingPrefix(clientId, formId, key)}photo.png`
    await expect(authorizePortalUpload(contact(), pathname, payload(formId))).resolves.toEqual({
      allowedContentTypes: [...ALLOWED_MIME_TYPES], maximumSizeInBytes: MAX_ATTACHMENT_BYTES, addRandomSuffix: true,
      tokenPayload: JSON.stringify({ formId, submissionKey: key }),
    })
  })

  it('refuses another client\'s form, a form without attachments and a paused form', async () => {
    await expect(authorizePortalUpload(contact(), `${portalStagingPrefix(clientId, otherClientFormId, key)}x.pdf`, payload(otherClientFormId)))
      .rejects.toThrow('This form is not available.')
    await expect(authorizePortalUpload(contact(), `${portalStagingPrefix(clientId, noFilesFormId, key)}x.pdf`, payload(noFilesFormId)))
      .rejects.toThrow('This form does not accept files.')
    await setFormPaused(org.id, admin.id, formId, true)
    await expect(authorizePortalUpload(contact(), `${portalStagingPrefix(clientId, formId, key)}x.pdf`, payload(formId)))
      .rejects.toThrow('This form is not available.')
    await setFormPaused(org.id, admin.id, formId, false)
  })

  it.each([
    ['another client\'s folder', () => `${portalStagingPrefix(otherClientId, formId, key)}x.pdf`],
    ['another visit\'s folder', () => `${portalStagingPrefix(clientId, formId, crypto.randomUUID())}x.pdf`],
    ['a nested path', () => `${portalStagingPrefix(clientId, formId, key)}a/x.pdf`],
    ['an unsanitized name', () => `${portalStagingPrefix(clientId, formId, key)}.x.pdf`],
  ])('refuses %s', async (_label, path) => {
    await expect(authorizePortalUpload(contact(), path(), payload(formId))).rejects.toThrow('Invalid upload path')
  })

  it('refuses a malformed payload', async () => {
    await expect(authorizePortalUpload(contact(), `${portalStagingPrefix(clientId, formId, key)}x.pdf`, '{"formId":"x"}'))
      .rejects.toThrow('Invalid upload request')
  })
})
