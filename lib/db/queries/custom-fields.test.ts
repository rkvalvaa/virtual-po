import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  listCustomFieldDefinitions,
  createCustomFieldDefinition,
  updateCustomFieldDefinition,
  deleteCustomFieldDefinition,
  updateRequestCustomFields,
} from './custom-fields'
import { getFeatureRequestById } from './feature-requests'
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

describe.skipIf(!hasDb())('custom field queries', () => {
  let org: TestOrg
  let otherOrg: TestOrg
  let user: TestUser
  let otherUser: TestUser
  let request: TestRequest

  beforeAll(async () => {
    org = await createTestOrg('cf-test')
    otherOrg = await createTestOrg('cf-other')
    user = await createTestUser(org)
    otherUser = await createTestUser(otherOrg)
    request = await createTestRequest(org, user, 'Custom fields request')
  })

  afterAll(async () => {
    await cleanupTestOrg(org, [user.id])
    await cleanupTestOrg(otherOrg, [otherUser.id])
  })

  it('should return an empty list for an organization with no definitions', async () => {
    expect(await listCustomFieldDefinitions(otherOrg.id)).toEqual([])
  })

  it('should derive the storage key from the field name on create', async () => {
    const def = await createCustomFieldDefinition({
      organizationId: org.id,
      name: 'Business Unit',
      type: 'TEXT',
    })
    expect(def.key).toBe('business_unit')
    expect(def.type).toBe('TEXT')
    expect(def.required).toBe(false)
    expect(def.options).toEqual([])
  })

  it('should reject a name that slugifies to nothing', async () => {
    await expect(
      createCustomFieldDefinition({
        organizationId: org.id,
        name: '***',
        type: 'TEXT',
      })
    ).rejects.toThrow(/at least one letter or number/)
  })

  it('should reject a duplicate key within the same organization', async () => {
    await expect(
      createCustomFieldDefinition({
        organizationId: org.id,
        name: 'business unit',
        type: 'TEXT',
      })
    ).rejects.toThrow()
  })

  it('should store options for a SELECT field', async () => {
    const def = await createCustomFieldDefinition({
      organizationId: org.id,
      name: 'Team',
      type: 'SELECT',
      options: ['Platform', 'Growth'],
      required: true,
    })
    expect(def.options).toEqual(['Platform', 'Growth'])
    expect(def.required).toBe(true)
  })

  it('should discard options for non-SELECT field types', async () => {
    const def = await createCustomFieldDefinition({
      organizationId: org.id,
      name: 'Target Date',
      type: 'DATE',
      options: ['ignored'],
    })
    expect(def.options).toEqual([])
  })

  it('should append new definitions after existing ones', async () => {
    const definitions = await listCustomFieldDefinitions(org.id)
    expect(definitions.map((d) => d.key)).toEqual([
      'business_unit',
      'team',
      'target_date',
    ])
  })

  it('should scope the list to a single organization', async () => {
    expect(await listCustomFieldDefinitions(otherOrg.id)).toEqual([])
  })

  it('should rename a definition without changing its key', async () => {
    const [first] = await listCustomFieldDefinitions(org.id)
    const updated = await updateCustomFieldDefinition(first.id, org.id, {
      name: 'Business Area',
    })
    expect(updated?.name).toBe('Business Area')
    expect(updated?.key).toBe('business_unit')
  })

  it('should not update a definition belonging to another organization', async () => {
    const [first] = await listCustomFieldDefinitions(org.id)
    const updated = await updateCustomFieldDefinition(first.id, otherOrg.id, {
      name: 'Hijacked',
    })
    expect(updated).toBeNull()
  })

  it('should reorder definitions by sort order', async () => {
    const before = await listCustomFieldDefinitions(org.id)
    const [first, second] = before
    await updateCustomFieldDefinition(first.id, org.id, {
      sortOrder: second.sortOrder,
    })
    await updateCustomFieldDefinition(second.id, org.id, {
      sortOrder: first.sortOrder,
    })

    const after = await listCustomFieldDefinitions(org.id)
    expect(after[0].key).toBe(second.key)
    expect(after[1].key).toBe(first.key)
  })

  it('should default a request to empty custom fields', async () => {
    const fresh = await getFeatureRequestById(request.id)
    expect(fresh?.customFields).toEqual({})
  })

  it('should write and read back custom field values', async () => {
    const updated = await updateRequestCustomFields(request.id, org.id, {
      business_unit: 'Payments',
      team: 'Platform',
      target_date: '2026-09-07',
    })
    expect(updated?.customFields).toEqual({
      business_unit: 'Payments',
      team: 'Platform',
      target_date: '2026-09-07',
    })

    const reread = await getFeatureRequestById(request.id)
    expect(reread?.customFields.business_unit).toBe('Payments')
  })

  it('should preserve number values as numbers through JSONB', async () => {
    const updated = await updateRequestCustomFields(request.id, org.id, {
      est_cost: 42.5,
      business_unit: null,
    })
    expect(updated?.customFields.est_cost).toBe(42.5)
    expect(updated?.customFields.business_unit).toBeNull()
  })

  it('should replace the whole value map rather than merging', async () => {
    await updateRequestCustomFields(request.id, org.id, { team: 'Growth' })
    const reread = await getFeatureRequestById(request.id)
    expect(reread?.customFields).toEqual({ team: 'Growth' })
  })

  it('should not write custom fields for a request in another organization', async () => {
    const result = await updateRequestCustomFields(request.id, otherOrg.id, {
      team: 'Platform',
    })
    expect(result).toBeNull()

    const reread = await getFeatureRequestById(request.id)
    expect(reread?.customFields).toEqual({ team: 'Growth' })
  })

  it('should not delete a definition belonging to another organization', async () => {
    const [first] = await listCustomFieldDefinitions(org.id)
    expect(await deleteCustomFieldDefinition(first.id, otherOrg.id)).toBe(false)
    expect(await listCustomFieldDefinitions(org.id)).toHaveLength(3)
  })

  it('should delete a definition within its own organization', async () => {
    const [first] = await listCustomFieldDefinitions(org.id)
    expect(await deleteCustomFieldDefinition(first.id, org.id)).toBe(true)

    const remaining = await listCustomFieldDefinitions(org.id)
    expect(remaining).toHaveLength(2)
    expect(remaining.some((d) => d.id === first.id)).toBe(false)
  })
})
