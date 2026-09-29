// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { cleanupTestOrg, createTestOrg, createTestUser, hasDb, type TestOrg, type TestUser } from '@/test/db-helpers'
import { query } from '@/lib/db/pool'
import { definitionProblems } from '@/lib/forms/definition'
import { createForm, createInternalForm, listForms, publishForm, setFormPaused } from './intake-forms'
import { createClientAccount } from './client-accounts'
import { archiveServiceGroup, createServiceGroup } from './service-groups'
import { listFeatureRequests } from './feature-requests'
import { getInternalForm, listInternalForms, submitInternalRequest } from './internal-forms'

const answers = {
  summary: 'Rotate the VPN certificates', affected: 'Remote access', reason: 'They expire in March',
  scope: 'Both gateways', impact: 'Short reconnects', requested_timing: '2026-11-02', cost: 'None',
}

describe.skipIf(!hasDb())('internal change-request forms', () => {
  let org: TestOrg
  let otherOrg: TestOrg
  let admin: TestUser
  let stakeholder: TestUser
  let outsider: TestUser
  let groupId: string
  let otherGroupId: string
  let formId: string

  beforeAll(async () => {
    org = await createTestOrg('internal-forms')
    otherOrg = await createTestOrg('internal-forms-other')
    admin = await createTestUser(org, 'ADMIN')
    stakeholder = await createTestUser(org, 'STAKEHOLDER')
    outsider = await createTestUser(otherOrg, 'ADMIN')
    groupId = (await createServiceGroup(org.id, admin.id, { name: 'IT Operations', fallbackOwnerId: admin.id })).id
    otherGroupId = (await createServiceGroup(org.id, admin.id, { name: 'Facilities', fallbackOwnerId: admin.id })).id
    formId = (await createInternalForm(org.id, admin.id, groupId, 'Change request')).id
    await publishForm(org.id, admin.id, formId)
  })
  afterAll(async () => {
    await cleanupTestOrg(org, [admin.id, stakeholder.id])
    await cleanupTestOrg(otherOrg, [outsider.id])
  })

  it('starts a new internal form from the default change-request definition, publishable as-is', async () => {
    const form = (await listForms(org.id)).find(f => f.id === formId)!
    expect(form).toMatchObject({ audience: 'INTERNAL', requestType: 'CHANGE', serviceGroupId: groupId, serviceGroupName: 'IT Operations', clientAccountId: null })
    expect(form.draft.fields.map(f => f.key)).toEqual(['summary', 'affected', 'reason', 'scope', 'impact', 'requested_timing', 'cost'])
    expect(definitionProblems(form.draft, { publish: true })).toEqual([])
    await expect(query(`UPDATE intake_forms SET service_group_id = NULL WHERE id = $1`, [formId])).rejects.toThrow(/intake_forms_audience/)
    await expect(createInternalForm(org.id, stakeholder.id, groupId, 'Sneaky')).rejects.toThrow(/administrator/)
  })

  it('files a CHANGE request into the form group at the start of the workflow, for any member', async () => {
    const result = await submitInternalRequest({ orgId: org.id, userId: stakeholder.id, formId, submissionKey: crypto.randomUUID(), answers })
    expect(result.status).toBe('received')
    const requestId = result.status === 'received' ? result.requestId : ''
    const row = (await query(`SELECT organization_id, requester_id, title, request_type, workflow_version, workflow_state, service_group_id,
        source_form_id, source_form_version, form_answers FROM feature_requests WHERE id = $1`, [requestId])).rows[0]
    expect(row).toMatchObject({ organization_id: org.id, requester_id: stakeholder.id, title: 'Rotate the VPN certificates', request_type: 'CHANGE',
      workflow_version: 1, workflow_state: 'SUBMITTED', service_group_id: groupId, source_form_id: formId, source_form_version: 1 })
    expect(row.form_answers).toContainEqual({ key: 'reason', label: 'Reason for the change', value: 'They expire in March' })
    expect((await listFeatureRequests(org.id)).requests.map(r => r.id)).not.toContain(requestId)
    const created = await query(`SELECT metadata FROM activity_log WHERE request_id = $1 AND action = 'REQUEST_CREATED'`, [requestId])
    expect(created.rows[0].metadata).toMatchObject({ source: 'internal-form', formId, serviceGroupId: groupId, workflowVersion: 1 })
  })

  it('returns the same request for a retried submission', async () => {
    const key = crypto.randomUUID()
    const first = await submitInternalRequest({ orgId: org.id, userId: stakeholder.id, formId, submissionKey: key, answers })
    const second = await submitInternalRequest({ orgId: org.id, userId: stakeholder.id, formId, submissionKey: key, answers })
    expect(second).toEqual(first)
    expect((await query('SELECT COUNT(*)::int AS n FROM feature_requests WHERE creation_key = $1', [key])).rows[0].n).toBe(1)
  })

  it('reports invalid answers without filing anything', async () => {
    const result = await submitInternalRequest({ orgId: org.id, userId: stakeholder.id, formId, submissionKey: crypto.randomUUID(), answers: { ...answers, reason: '' } })
    expect(result).toMatchObject({ status: 'invalid', errors: { reason: expect.any(String) } })
  })

  it('takes organization, type and group from the form row only (forged payload)', async () => {
    const forged = { ...answers, request_type: 'PRODUCT', service_group_id: otherGroupId, organization_id: otherOrg.id, workflow_state: 'CLOSED' }
    const result = await submitInternalRequest({ orgId: org.id, userId: stakeholder.id, formId, submissionKey: crypto.randomUUID(), answers: forged })
    const requestId = result.status === 'received' ? result.requestId : ''
    const row = (await query('SELECT organization_id, request_type, service_group_id, workflow_state FROM feature_requests WHERE id = $1', [requestId])).rows[0]
    expect(row).toEqual({ organization_id: org.id, request_type: 'CHANGE', service_group_id: groupId, workflow_state: 'SUBMITTED' })

    await expect(submitInternalRequest({ orgId: otherOrg.id, userId: outsider.id, formId, submissionKey: crypto.randomUUID(), answers })).rejects.toThrow(/Form not found/)
    await expect(submitInternalRequest({ orgId: org.id, userId: outsider.id, formId, submissionKey: crypto.randomUUID(), answers })).rejects.toThrow(/Form not found/)
  })

  it('offers only published internal forms of active groups, never client forms', async () => {
    const client = await createClientAccount(org.id, admin.id, 'Acme')
    const clientForm = (await createForm(org.id, admin.id, client.id, 'Client form')).id
    const paused = (await createInternalForm(org.id, admin.id, groupId, 'Paused form')).id
    await publishForm(org.id, admin.id, paused)
    await setFormPaused(org.id, admin.id, paused, true)
    const retired = (await createInternalForm(org.id, admin.id, otherGroupId, 'Facilities request')).id
    await publishForm(org.id, admin.id, retired)
    await archiveServiceGroup(org.id, admin.id, otherGroupId)

    expect((await listInternalForms(org.id)).map(f => f.id)).toEqual([formId])
    expect(await listInternalForms(otherOrg.id)).toEqual([])
    for (const id of [clientForm, paused, retired]) {
      expect(await getInternalForm(org.id, id)).toBeNull()
      await expect(submitInternalRequest({ orgId: org.id, userId: stakeholder.id, formId: id, submissionKey: crypto.randomUUID(), answers })).rejects.toThrow(/Form not found/)
    }
    expect(await getInternalForm(org.id, formId)).toMatchObject({ id: formId, groupName: 'IT Operations' })
  })
})
