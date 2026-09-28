// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanupTestOrg, createTestOrg, createTestRequest, createTestUser, hasDb, type TestOrg } from '@/test/db-helpers'
import { createAttachment } from '@/lib/db/queries/attachments'
import { sweepOrphanBlobs } from './orphans'

const blob = vi.hoisted(() => ({ list: vi.fn(), del: vi.fn() }))
vi.mock('@vercel/blob', () => ({ list: blob.list, del: blob.del, get: vi.fn(), head: vi.fn(), BlobNotFoundError: class extends Error {} }))

const now = new Date('2026-09-28T12:00:00Z')
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600_000)
const stored = (pathname: string, uploadedAt: Date) => ({ pathname, url: `https://blob.example/${pathname}`, uploadedAt })

/** Serve `pages` per prefix, one page per list call, chained by cursor. */
function serve(pages: Record<string, ReturnType<typeof stored>[][]>) {
  blob.list.mockImplementation(async ({ prefix, cursor }: { prefix: string; cursor?: string }) => {
    const index = cursor ? Number(cursor) : 0
    const all = pages[prefix] ?? []
    const hasMore = index + 1 < all.length
    return { blobs: all[index] ?? [], hasMore, cursor: hasMore ? String(index + 1) : undefined }
  })
}

beforeEach(() => { blob.list.mockReset(); blob.del.mockReset().mockResolvedValue(undefined) })

describe('sweepOrphanBlobs', () => {
  it('refuses to sweep anything outside orgs/ and portal/', async () => {
    await expect(sweepOrphanBlobs({ now, prefixes: ['exports/'] })).rejects.toThrow(/orgs\/ or portal\//)
    await expect(sweepOrphanBlobs({ now, prefixes: [''] })).rejects.toThrow()
    expect(blob.list).not.toHaveBeenCalled()
    expect(blob.del).not.toHaveBeenCalled()
  })
})

describe.skipIf(!hasDb())('sweepOrphanBlobs against recorded attachments', () => {
  let org: TestOrg
  let userIds: string[] = []
  afterEach(async () => { await cleanupTestOrg(org, userIds) })

  async function recorded(storageKey: string) {
    org = await createTestOrg('orphan-sweep')
    const user = await createTestUser(org, 'ADMIN')
    userIds = [user.id]
    const request = await createTestRequest(org, user)
    await createAttachment({ requestId: request.id, filename: 'kept.pdf', mimeType: 'application/pdf', size: 1,
      url: `https://blob.example/${storageKey}`, storageKey, uploadedBy: user.id })
  }

  it('deletes only unrecorded blobs older than a day, paging through both prefixes', async () => {
    const run = crypto.randomUUID()
    const keptKey = `orgs/${run}/requests/r/kept.pdf`
    await recorded(keptKey)
    const orphan = stored(`orgs/${run}/requests/r/orphan.pdf`, hoursAgo(30))
    const staged = stored(`portal/${run}/f/visit/abandoned.pdf`, hoursAgo(25))
    serve({
      'orgs/': [[stored(keptKey, hoursAgo(48))], [orphan, stored(`orgs/${run}/requests/r/fresh.pdf`, hoursAgo(2))]],
      'portal/': [[staged]],
    })

    const result = await sweepOrphanBlobs({ now })

    expect(blob.list.mock.calls.map(([options]) => options.prefix)).toEqual(['orgs/', 'orgs/', 'portal/'])
    expect(blob.del.mock.calls.flatMap(([urls]) => urls)).toEqual([orphan.url, staged.url])
    expect(result).toEqual({ checked: 4, deleted: 2, complete: true })
  })

  it('stops after the per-run cap and says the sweep is incomplete', async () => {
    const run = crypto.randomUUID()
    await recorded(`orgs/${run}/requests/r/other.pdf`)
    serve({ 'orgs/': [[stored(`orgs/${run}/a.pdf`, hoursAgo(30)), stored(`orgs/${run}/b.pdf`, hoursAgo(30))], [stored(`orgs/${run}/c.pdf`, hoursAgo(30))]] })

    const result = await sweepOrphanBlobs({ now, maxChecked: 2 })

    expect(blob.list).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ checked: 2, deleted: 2, complete: false })
  })
})
