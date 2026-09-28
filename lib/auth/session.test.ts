import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ session: null as unknown }))
vi.mock('@/auth', () => ({ auth: async () => state.session }))
vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw new Error(`REDIRECT ${url}`) },
}))

import { requireAuth, requirePortalContact } from './session'

const member = { user: { id: 'u1', orgId: 'org-1', role: 'REVIEWER' } }
const client = { user: { id: 'u2', orgId: null, role: null, clientContactId: 'contact-1', clientAccountId: 'acct-1' } }

describe('requireAuth', () => {
  beforeEach(() => { state.session = null })

  it('returns a workspace member session', async () => {
    state.session = member
    await expect(requireAuth()).resolves.toBe(member)
  })

  it('sends a client contact to the portal instead of the workspace', async () => {
    state.session = client
    await expect(requireAuth()).rejects.toThrow('REDIRECT /portal')
  })

  it('sends a visitor without a session to login', async () => {
    await expect(requireAuth()).rejects.toThrow('REDIRECT /login')
  })
})

describe('requirePortalContact', () => {
  beforeEach(() => { state.session = null })

  it('returns the contact identity for a client session', async () => {
    state.session = client
    await expect(requirePortalContact()).resolves.toEqual({ userId: 'u2', clientContactId: 'contact-1', clientAccountId: 'acct-1' })
  })

  it('sends a workspace member back to the workspace', async () => {
    state.session = member
    await expect(requirePortalContact()).rejects.toThrow('REDIRECT /requests')
  })

  it('sends a visitor without a session to login', async () => {
    await expect(requirePortalContact()).rejects.toThrow('REDIRECT /login')
  })
})
