import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getAllTemplates,
} from './templates'
import {
  hasDb,
  createTestOrg,
  cleanupTestOrg,
  type TestOrg,
} from '@/test/db-helpers'

describe.skipIf(!hasDb())('template queries', () => {
  let org: TestOrg
  let otherOrg: TestOrg

  beforeAll(async () => {
    org = await createTestOrg('tpl-test')
    otherOrg = await createTestOrg('tpl-other')
  })

  afterAll(async () => {
    await cleanupTestOrg(org)
    await cleanupTestOrg(otherOrg)
  })

  it('should not update a template belonging to another organization', async () => {
    const template = await createTemplate({
      organizationId: org.id,
      name: 'Bug report',
      category: 'BUG_FIX',
    })

    const updated = await updateTemplate(template.id, otherOrg.id, { name: 'Hijacked' })

    expect(updated).toBeNull()
    const [stored] = (await getAllTemplates(org.id)).filter((t) => t.id === template.id)
    expect(stored.name).toBe('Bug report')
  })

  it('should not delete a template belonging to another organization', async () => {
    const template = await createTemplate({
      organizationId: org.id,
      name: 'Integration',
      category: 'INTEGRATION',
    })

    const deleted = await deleteTemplate(template.id, otherOrg.id)

    expect(deleted).toBe(false)
    const ids = (await getAllTemplates(org.id)).map((t) => t.id)
    expect(ids).toContain(template.id)
  })

  it('should update and delete a template in the same organization', async () => {
    const template = await createTemplate({
      organizationId: org.id,
      name: 'Improvement',
      category: 'IMPROVEMENT',
    })

    const updated = await updateTemplate(template.id, org.id, { name: 'Enhancement' })
    expect(updated?.name).toBe('Enhancement')

    expect(await deleteTemplate(template.id, org.id)).toBe(true)
    const ids = (await getAllTemplates(org.id)).map((t) => t.id)
    expect(ids).not.toContain(template.id)
  })
})
