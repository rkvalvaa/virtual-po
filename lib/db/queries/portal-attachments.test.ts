// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanupTestOrg, createTestOrg, createTestUser, hasDb, type TestOrg } from '@/test/db-helpers'
import { query } from '@/lib/db/pool'
import { addClientContact, createClientAccount } from './client-accounts'
import { createForm, publishForm, saveFormDraft } from './intake-forms'
import { getMyRequest, getMyAttachment, submitPortalRequest } from './portal'
import { portalStagingPrefix } from '@/lib/storage/portal-upload-authorization'

const blob = vi.hoisted(() => ({ head: vi.fn() }))
vi.mock('@vercel/blob', () => ({ head: blob.head, get: vi.fn(), del: vi.fn(), BlobNotFoundError: class extends Error {} }))

describe.skipIf(!hasDb())('portal submissions with attachments', () => {
  const fixtures: { org: TestOrg; users: string[] }[] = []
  beforeEach(() => {
    process.env.BLOB_READ_WRITE_TOKEN = 'test'
    blob.head.mockReset().mockImplementation(async (pathname: string) => ({
      pathname, url: `https://blob.example/${pathname}`, contentType: 'application/pdf', size: 2 * 1024 * 1024,
    }))
  })
  afterEach(async () => {
    delete process.env.BLOB_READ_WRITE_TOKEN
    for (const { org, users } of fixtures.splice(0)) await cleanupTestOrg(org, users)
  })

  async function setup() {
    const org = await createTestOrg('portal-files')
    const admin = await createTestUser(org, 'ADMIN')
    const client = await createClientAccount(org.id, admin.id, 'Files client')
    const email = `files-${crypto.randomUUID()}@client.example`
    const contact = await addClientContact(org.id, admin.id, client.id, email)
    const user = await query<{ id: string }>('INSERT INTO users (email) VALUES ($1) RETURNING id', [email])
    fixtures.push({ org, users: [admin.id, user.rows[0].id] })
    const { id: formId } = await createForm(org.id, admin.id, client.id, 'With files')
    await saveFormDraft(org.id, admin.id, formId, {
      title: 'With files', instructions: '', titleFieldKey: 'summary', maxAttachments: 2,
      fields: [{ key: 'summary', label: 'Summary', type: 'TEXT', required: true, options: [], showIf: null }],
    })
    await publishForm(org.id, admin.id, formId)
    const who = { userId: user.rows[0].id, clientContactId: contact.id, clientAccountId: client.id }
    const key = crypto.randomUUID()
    const staged = (name: string, submissionKey = key) => ({ pathname: `${portalStagingPrefix(client.id, formId, submissionKey)}${name}`, name })
    return { org, admin, formId, who, key, staged }
  }

  it('attaches the staged files to the new request, from what the store reports, once', async () => {
    const { formId, who, key, staged } = await setup()
    const files = [staged('plan-AbC.pdf'), staged('photo-XyZ.pdf')]
    const first = await submitPortalRequest({ formId, contact: who, submissionKey: key, answers: { summary: 'With files' }, attachments: files })
    const retry = await submitPortalRequest({ formId, contact: who, submissionKey: key, answers: { summary: 'With files' }, attachments: files })
    expect(retry).toEqual(first)
    if (first.status !== 'received') throw new Error('not received')

    const rows = await query(`SELECT a.filename, a.size, a.mime_type, a.uploaded_by, a.storage_key FROM attachments a
      JOIN feature_requests r ON r.id = a.request_id WHERE r.public_reference = $1 ORDER BY a.filename`, [first.reference])
    expect(rows.rows).toEqual([
      { filename: 'photo-XyZ.pdf', size: 2 * 1024 * 1024, mime_type: 'application/pdf', uploaded_by: who.userId, storage_key: files[1].pathname },
      { filename: 'plan-AbC.pdf', size: 2 * 1024 * 1024, mime_type: 'application/pdf', uploaded_by: who.userId, storage_key: files[0].pathname },
    ])
  })

  it('refuses more files than the form allows, files from another visit, and files the store rejects', async () => {
    const { formId, who, key, staged } = await setup()
    const tooMany = [staged('a.pdf'), staged('b.pdf'), staged('c.pdf')]
    expect(await submitPortalRequest({ formId, contact: who, submissionKey: key, answers: { summary: 'x' }, attachments: tooMany }))
      .toEqual({ status: 'invalid', errors: { __attachments: 'Attach at most 2 files.' } })

    const foreign = [staged('a.pdf', crypto.randomUUID())]
    expect(await submitPortalRequest({ formId, contact: who, submissionKey: key, answers: { summary: 'x' }, attachments: foreign }))
      .toEqual({ status: 'invalid', errors: { __attachments: 'a.pdf could not be attached. Upload it again.' } })

    blob.head.mockImplementation(async (pathname: string) => ({ pathname, url: 'u', contentType: 'application/x-msdownload', size: 10 }))
    const result = await submitPortalRequest({ formId, contact: who, submissionKey: key, answers: { summary: 'x' }, attachments: [staged('tool.exe')] })
    expect(result.status).toBe('invalid')
    expect((await query('SELECT 1 FROM feature_requests WHERE submitter_contact_id = $1', [who.clientContactId])).rowCount).toBe(0)
  })

  it('shows the contact only the files they uploaded, and lets them fetch only those', async () => {
    const { org, admin, formId, who, key, staged } = await setup()
    const receipt = await submitPortalRequest({ formId, contact: who, submissionKey: key, answers: { summary: 'Files' }, attachments: [staged('mine-AbC.pdf')] })
    if (receipt.status !== 'received') throw new Error('not received')
    const request = (await query('SELECT id FROM feature_requests WHERE public_reference = $1', [receipt.reference])).rows[0]
    const internal = await query<{ id: string }>(`INSERT INTO attachments (request_id, filename, mime_type, size, url, storage_key, uploaded_by)
      VALUES ($1, 'internal-notes.pdf', 'application/pdf', 1, 'u', $2, $3) RETURNING id`, [request.id, `orgs/${org.id}/requests/${request.id}/internal-notes.pdf`, admin.id])

    const mine = await getMyRequest(who, receipt.reference)
    expect(mine!.files.map((f) => f.filename)).toEqual(['mine-AbC.pdf'])
    expect(await getMyAttachment(who, receipt.reference, mine!.files[0].id)).toMatchObject({ filename: 'mine-AbC.pdf' })
    expect(await getMyAttachment(who, receipt.reference, internal.rows[0].id)).toBeNull()
    expect(await getMyAttachment({ ...who, clientContactId: crypto.randomUUID() }, receipt.reference, mine!.files[0].id)).toBeNull()
  })
})
