// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanupTestOrg, createTestOrg, createTestUser, hasDb, type TestOrg, type TestUser } from '@/test/db-helpers'
import { upsertIntegration } from '@/lib/db/queries/jira-sync'
import { query } from '@/lib/db/pool'
import { previewLinearImport, importLinearPage, resolveLinearImportConflict } from './linear-actions'
import { previewJiraImport, importJiraPage } from './jira-actions'
import { previewGitHubImport, importGitHubPage } from './github-issues-actions'

const actor = vi.hoisted(() => ({ id: '', orgId: '', role: 'REVIEWER' }))
const linear = vi.hoisted(() => ({ getTeams: vi.fn(), searchIssuesPage: vi.fn() }))
const jira = vi.hoisted(() => ({ getProjects: vi.fn(), searchIssuesPage: vi.fn() }))
const github = vi.hoisted(() => ({ listLabels: vi.fn(), searchIssuesPage: vi.fn() }))

vi.mock('@/lib/auth/session', () => ({ requireAuth: async () => ({ user: actor }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/linear/client', async importOriginal => ({ ...(await importOriginal<object>()), getLinearClientFromIntegration: () => linear }))
vi.mock('@/lib/jira/client', async importOriginal => ({ ...(await importOriginal<object>()), getJiraClientFromIntegration: () => jira }))
vi.mock('@/lib/github/issues-client', async importOriginal => ({ ...(await importOriginal<object>()), getGitHubIssuesClientFromToken: () => github }))
vi.mock('@/lib/github/client', () => ({ getGitHubToken: async () => 'test-token' }))

describe.skipIf(!hasDb())('tracker import actions (CCT-2068)', () => {
  let org: TestOrg
  let user: TestUser

  beforeAll(async () => {
    org = await createTestOrg('tracker-import-actions')
    user = await createTestUser(org, 'REVIEWER')
    Object.assign(actor, { id: user.id, orgId: org.id, role: 'REVIEWER' })
    await upsertIntegration(org.id, 'LINEAR', 'Linear', { apiKey: 'test', defaultTeamId: 'team-id' })
    await upsertIntegration(org.id, 'JIRA', 'Jira', { baseUrl: 'https://acme.atlassian.net', email: 'a@example.test', apiToken: 'test', defaultProjectKey: 'APP' })
    await upsertIntegration(org.id, 'GITHUB_ISSUES', 'GitHub', { defaultRepo: 'acme/app' })
  })

  afterAll(async () => cleanupTestOrg(org, [user.id]))

  beforeEach(() => {
    vi.resetAllMocks()
    actor.role = 'REVIEWER'
    linear.getTeams.mockResolvedValue([{ id: 'team-id', name: 'Engineering', key: 'ENG' }])
    linear.searchIssuesPage.mockResolvedValue({ items: [{ id: 'linear-id', identifier: 'ENG-1', title: 'Linear title', description: 'Linear body', url: 'https://linear/ENG-1', priority: 2, state: { id: 'todo', name: 'Todo' }, project: null, labels: { nodes: [{ id: 'label', name: 'Customer' }] } }], nextCursor: 'linear-next' })
    jira.getProjects.mockResolvedValue([{ id: 'project-id', key: 'APP', name: 'App' }])
    jira.searchIssuesPage.mockResolvedValue({ items: [{ id: 'jira-id', key: 'APP-1', self: 'self', fields: { summary: 'Jira title', description: 'Jira body', labels: ['Backend'], status: { name: 'Open' }, project: { key: 'APP' } } }], nextCursor: 'jira-next', total: 40 })
    github.listLabels.mockResolvedValue([])
    github.searchIssuesPage.mockResolvedValue({ items: [{ id: 1, node_id: 'github-node', number: 1, title: 'GitHub title', body: 'GitHub body', state: 'open', html_url: 'https://github.com/acme/app/issues/1', labels: [{ id: 1, name: 'enhancement', color: 'fff' }], milestone: null, created_at: '2026-01-01', updated_at: '2026-01-02' }], nextCursor: null, total: 1 })
  })

  it('previews normalized paginated results for every configured provider', async () => {
    expect(await previewLinearImport({ teamId: 'team-id', cursor: 'linear-current' })).toMatchObject({ success: true, page: { nextCursor: 'linear-next', items: [{ remoteEntityId: 'linear-id', description: 'Linear body', labels: ['Customer'], remoteStatus: { name: 'Todo' } }] } })
    expect(await previewJiraImport({ projectKey: 'APP', cursor: 'jira-current' })).toMatchObject({ success: true, page: { nextCursor: 'jira-next', items: [{ remoteEntityId: 'jira-id', sourceUrl: 'https://acme.atlassian.net/browse/APP-1', labels: ['Backend'] }] } })
    expect(await previewGitHubImport({ repoFullName: 'acme/app' })).toMatchObject({ success: true, page: { items: [{ remoteEntityId: 'github-node', description: 'GitHub body', labels: ['enhancement'], remoteStatus: { name: 'open' } }] } })
  })

  it('refetches the preview page and imports only selected stable IDs', async () => {
    const result = await importLinearPage({ teamId: 'team-id', cursor: null, remoteEntityIds: ['linear-id'] })
    expect(result).toMatchObject({ success: true, result: { created: 1, updated: 0, skipped: 0, failed: 0 } })
    if (!result.success) throw new Error(result.error)
    expect(linear.searchIssuesPage).toHaveBeenCalledTimes(1)
    const row = await query(`SELECT title, summary, tags, external_url FROM feature_requests WHERE id = $1`, [result.result?.items[0].requestId])
    expect(row.rows[0]).toEqual({ title: 'Linear title', summary: 'Linear body', tags: ['Customer'], external_url: 'https://linear/ENG-1' })

    const repeated = await importLinearPage({ teamId: 'team-id', cursor: null, remoteEntityIds: ['linear-id'] })
    expect(repeated).toMatchObject({ success: true, result: { created: 0, updated: 0, skipped: 1, failed: 0 } })
  })

  it('rejects unconfigured destinations before searching providers', async () => {
    expect(await previewLinearImport({ teamId: 'foreign-team' })).toMatchObject({ success: false })
    expect(await importJiraPage({ projectKey: 'OTHER', remoteEntityIds: ['jira-id'] })).toMatchObject({ success: false })
    expect(await previewGitHubImport({ repoFullName: 'other/repo' })).toMatchObject({ success: false })
    expect(linear.searchIssuesPage).not.toHaveBeenCalled()
    expect(jira.searchIssuesPage).not.toHaveBeenCalled()
    expect(github.searchIssuesPage).not.toHaveBeenCalled()
  })

  it('rejects stakeholders before provider reads or database writes', async () => {
    actor.role = 'STAKEHOLDER'
    expect(await previewLinearImport({ teamId: 'team-id' })).toEqual({ success: false, error: 'Insufficient permissions.' })
    expect(await importGitHubPage({ repoFullName: 'acme/app', remoteEntityIds: ['github-node'] })).toEqual({ success: false, error: 'Insufficient permissions.' })
    expect(linear.getTeams).not.toHaveBeenCalled()
    expect(github.listLabels).not.toHaveBeenCalled()
  })

  it('rejects a selected ID that was not in the refetched page', async () => {
    expect(await importLinearPage({ teamId: 'team-id', remoteEntityIds: ['invented-id'] })).toEqual({ success: false, error: 'The preview changed. Preview this page again before importing.' })
  })

  it('resolves a persisted conflict only for the current organization and provider', async () => {
    const first = await importLinearPage({ teamId: 'team-id', remoteEntityIds: ['linear-id'] })
    if (!first.success) throw new Error(first.error)
    const requestId = first.result!.items[0].requestId!
    await query(`UPDATE feature_requests SET title = 'Local title' WHERE id = $1`, [requestId])
    linear.searchIssuesPage.mockResolvedValueOnce({ ...await linear.searchIssuesPage(), items: [{ ...(await linear.searchIssuesPage()).items[0], title: 'Remote title changed' }] })
    const conflict = await importLinearPage({ teamId: 'team-id', remoteEntityIds: ['linear-id'] })
    if (!conflict.success) throw new Error(conflict.error)
    expect(conflict.result?.items[0].conflicts).toEqual([{ field: 'title', localValue: 'Local title', remoteValue: 'Remote title changed' }])
    expect(await resolveLinearImportConflict(conflict.result!.items[0].linkId!, { title: 'REMOTE' })).toMatchObject({ success: true, item: { conflicts: [] } })
    const row = await query(`SELECT title FROM feature_requests WHERE id = $1`, [requestId])
    expect(row.rows[0].title).toBe('Remote title changed')
  })
})
