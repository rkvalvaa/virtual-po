// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { retryEmailDeliveryAction, sendEmailTestAction } from './email-actions'
import { requireAuth } from '@/lib/auth/session'
import { enqueueAdminTestEmail, listEmailDeliveries, processEmailOutbox, retryEmailDelivery } from '@/lib/email/outbox'

vi.mock('@/lib/auth/session', () => ({ requireAuth: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/db/queries/email-preferences', () => ({ upsertEmailPreference: vi.fn() }))
vi.mock('@/lib/email/outbox', () => ({
  enqueueAdminTestEmail: vi.fn(),
  listEmailDeliveries: vi.fn(),
  processEmailOutbox: vi.fn(),
  retryEmailDelivery: vi.fn(),
}))

const orgId = '11111111-1111-4111-8111-111111111111'
const userId = '22222222-2222-4222-8222-222222222222'
const deliveryId = '33333333-3333-4333-8333-333333333333'

describe('email administration actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireAuth).mockResolvedValue({ user: { id: userId, orgId, role: 'ADMIN', email: 'admin@example.test' } } as never)
    vi.mocked(enqueueAdminTestEmail).mockResolvedValue({ id: deliveryId, status: 'QUEUED' } as never)
    vi.mocked(processEmailOutbox).mockResolvedValue({ processed: 1 })
    vi.mocked(listEmailDeliveries).mockResolvedValue([{ id: deliveryId, status: 'ACCEPTED' }] as never)
    vi.mocked(retryEmailDelivery).mockResolvedValue(true)
  })

  it('tests only the signed-in administrator delivery and reports provider acceptance accurately', async () => {
    expect(await sendEmailTestAction()).toEqual({ success: true, deliveryId, status: 'ACCEPTED' })
    expect(enqueueAdminTestEmail).toHaveBeenCalledWith(orgId, userId)
    expect(processEmailOutbox).toHaveBeenCalledWith({ orgId, deliveryId, limit: 1 })
  })

  it('does not call provider work for non-admins', async () => {
    vi.mocked(requireAuth).mockResolvedValue({ user: { id: userId, orgId, role: 'REVIEWER' } } as never)
    expect(await sendEmailTestAction()).toMatchObject({ success: false, error: expect.stringContaining('admins') })
    expect(enqueueAdminTestEmail).not.toHaveBeenCalled()
  })

  it('validates and tenant-scopes retries through the current admin identity', async () => {
    expect(await retryEmailDeliveryAction('not-a-uuid')).toMatchObject({ success: false })
    expect(retryEmailDelivery).not.toHaveBeenCalled()
    expect(await retryEmailDeliveryAction(deliveryId)).toEqual({ success: true })
    expect(retryEmailDelivery).toHaveBeenCalledWith(orgId, deliveryId, userId)
  })

  it('returns safe retry feedback when persistence fails', async () => {
    vi.mocked(retryEmailDelivery).mockRejectedValueOnce(new Error('database connection string secret'))
    expect(await retryEmailDeliveryAction(deliveryId)).toEqual({ success: false, error: 'Unable to queue the email retry. Try again.' })
  })
})
