// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { cleanupTestOrg, createTestOrg, createTestUser, hasDb, type TestOrg } from '@/test/db-helpers'
import { query } from '@/lib/db/pool'
import { createClientAccount } from './client-accounts'
import { createForm, listForms, publishForm, saveFormDraft, setFormPaused } from './intake-forms'
import type { FormDefinition } from '@/lib/forms/definition'

const definition = (title: string): FormDefinition => ({
  title,
  instructions: 'Describe the change.',
  titleFieldKey: 'summary',
  maxAttachments: 2,
  fields: [{ key: 'summary', label: 'Summary', type: 'TEXT', required: true, options: [], showIf: null }],
})

describe.skipIf(!hasDb())('intake forms', () => {
  const fixtures: { org: TestOrg; users: string[] }[] = []
  async function setup() {
    const org = await createTestOrg('forms')
    const other = await createTestOrg('forms-other')
    const admin = await createTestUser(org, 'ADMIN')
    const reviewer = await createTestUser(org, 'REVIEWER')
    const otherAdmin = await createTestUser(other, 'ADMIN')
    fixtures.push({ org, users: [admin.id, reviewer.id] }, { org: other, users: [otherAdmin.id] })
    const client = await createClientAccount(org.id, admin.id, 'Forms client')
    const otherClient = await createClientAccount(other.id, otherAdmin.id, 'Other client')
    return { org, other, admin, reviewer, otherAdmin, client, otherClient }
  }
  afterEach(async () => { for (const { org, users } of fixtures.splice(0)) await cleanupTestOrg(org, users) })

  it('publishes a draft as a frozen version that later draft edits do not change', async () => {
    const { org, admin, client } = await setup()
    const { id } = await createForm(org.id, admin.id, client.id, 'Change request')
    await saveFormDraft(org.id, admin.id, id, definition('Change request'))
    await publishForm(org.id, admin.id, id)

    await saveFormDraft(org.id, admin.id, id, definition('Renamed draft'))
    let [form] = await listForms(org.id)
    expect(form).toMatchObject({ status: 'PUBLISHED', version: 1, clientName: 'Forms client' })
    expect(form.published?.title).toBe('Change request')
    expect(form.draft.title).toBe('Renamed draft')

    await publishForm(org.id, admin.id, id)
    ;[form] = await listForms(org.id)
    expect(form).toMatchObject({ version: 2 })
    expect(form.published?.title).toBe('Renamed draft')
    const audit = await query(`SELECT metadata->>'operation' AS op FROM activity_log WHERE organization_id = $1 AND action = 'FORM_UPDATED'`, [org.id])
    expect(audit.rows.map((r) => r.op)).toEqual(expect.arrayContaining(['created', 'draft-saved', 'published']))
  })

  it('refuses to publish a form without fields', async () => {
    const { org, admin, client } = await setup()
    const { id } = await createForm(org.id, admin.id, client.id, 'Empty')
    await expect(publishForm(org.id, admin.id, id)).rejects.toThrow('Add at least one field.')
    expect((await listForms(org.id))[0].status).toBe('DRAFT')
  })

  it('rejects an invalid draft', async () => {
    const { org, admin, client } = await setup()
    const { id } = await createForm(org.id, admin.id, client.id, 'Broken')
    const broken = { ...definition('Broken'), fields: [{ key: 'area', label: 'Area', type: 'SELECT' as const, required: true, options: [], showIf: null }] }
    await expect(saveFormDraft(org.id, admin.id, id, broken)).rejects.toThrow('Area needs at least one option.')
  })

  it('pauses and resumes a published form without changing its version', async () => {
    const { org, admin, client } = await setup()
    const { id } = await createForm(org.id, admin.id, client.id, 'Pausable')
    await saveFormDraft(org.id, admin.id, id, definition('Pausable'))
    await publishForm(org.id, admin.id, id)
    await setFormPaused(org.id, admin.id, id, true)
    expect((await listForms(org.id))[0]).toMatchObject({ status: 'PAUSED', version: 1 })
    await setFormPaused(org.id, admin.id, id, false)
    expect((await listForms(org.id))[0]).toMatchObject({ status: 'PUBLISHED', version: 1 })
  })

  it('refuses non-administrators, other organizations and other organizations\' clients', async () => {
    const { org, other, admin, reviewer, otherAdmin, client, otherClient } = await setup()
    await expect(createForm(org.id, reviewer.id, client.id, 'By reviewer')).rejects.toThrow(/administrator/i)
    await expect(createForm(org.id, admin.id, otherClient.id, 'Foreign client')).rejects.toThrow('Client not found.')

    const { id } = await createForm(org.id, admin.id, client.id, 'Ours')
    await expect(saveFormDraft(other.id, otherAdmin.id, id, definition('Hijacked'))).rejects.toThrow('Form not found.')
    await expect(publishForm(other.id, otherAdmin.id, id)).rejects.toThrow('Form not found.')
    await expect(setFormPaused(other.id, otherAdmin.id, id, true)).rejects.toThrow('Form not found.')
    expect((await listForms(org.id))[0].draft.title).toBe('Ours')
    expect(await listForms(other.id)).toEqual([])
  })
})
