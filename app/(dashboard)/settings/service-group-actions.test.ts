import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ role: 'ADMIN', create: vi.fn() }))
vi.mock('@/lib/auth/session', () => ({ requireAuth: async () => ({ user: { id: 'a1', orgId: 'o1', role: mocks.role } }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/db/queries/service-groups', () => ({
  createServiceGroup: mocks.create, renameServiceGroup: vi.fn(), archiveServiceGroup: vi.fn(),
  setFallbackOwner: vi.fn(), setGroupMember: vi.fn(), removeGroupMember: vi.fn(),
}))

import { manageServiceGroups } from './service-group-actions'

const owner = '0b8751ce-4876-4ebc-b426-d5b95dee88e4'

describe('manageServiceGroups', () => {
  beforeEach(() => { mocks.role = 'ADMIN'; mocks.create.mockReset().mockResolvedValue({ id: 'g1' }) })

  it('refuses reviewers and stakeholders before touching any group', async () => {
    for (const role of ['REVIEWER', 'STAKEHOLDER']) {
      mocks.role = role
      expect(await manageServiceGroups({ kind: 'create', name: 'IT', fallbackOwnerId: owner })).toEqual({ success: false, error: 'Only administrators can manage service groups.' })
    }
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('validates input and passes an admin change through', async () => {
    expect((await manageServiceGroups({ kind: 'create', name: ' ', fallbackOwnerId: owner })).success).toBe(false)
    expect(await manageServiceGroups({ kind: 'create', name: 'IT Operations', fallbackOwnerId: owner })).toEqual({ success: true })
    expect(mocks.create).toHaveBeenCalledWith('o1', 'a1', { name: 'IT Operations', fallbackOwnerId: owner })
  })

  it('shows the query layer refusal', async () => {
    mocks.create.mockRejectedValue(new Error('Choose a member of this workspace.'))
    expect(await manageServiceGroups({ kind: 'create', name: 'IT', fallbackOwnerId: owner })).toEqual({ success: false, error: 'Choose a member of this workspace.' })
  })
})
