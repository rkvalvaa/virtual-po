// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLinearClient } from '@/lib/linear/client'
import { createJiraClient } from '@/lib/jira/client'
import { createGitHubIssuesClient } from '@/lib/github/issues-client'
import { previewGitHubPage, previewJiraPage, previewLinearPage } from './provider-pages'

afterEach(() => vi.unstubAllGlobals())

describe('provider pagination boundaries', () => {
  it('sends and returns a Linear cursor with complete issue fields', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({
      data: {
        issueSearch: {
          nodes: [{
            id: 'linear-stable', identifier: 'ENG-42', title: 'Linear title', description: 'Linear body',
            url: 'https://linear.app/acme/issue/ENG-42', priority: 2,
            state: { id: 'started-id', name: 'Started' }, project: { id: 'project-id', name: 'Roadmap' },
            labels: { nodes: [{ id: 'label-1', name: 'Customer' }] },
          }],
          pageInfo: { hasNextPage: true, endCursor: 'linear-next' },
        },
      },
    }))
    vi.stubGlobal('fetch', fetch)
    const page = await createLinearClient({ apiKey: 'test' }).searchIssuesPage('team:ENG', 'team-id', { cursor: 'linear-current', pageSize: 25 })
    expect(page).toEqual({
      items: [{
        id: 'linear-stable', identifier: 'ENG-42', title: 'Linear title', description: 'Linear body',
        url: 'https://linear.app/acme/issue/ENG-42', priority: 2,
        state: { id: 'started-id', name: 'Started' }, project: { id: 'project-id', name: 'Roadmap' },
        labels: { nodes: [{ id: 'label-1', name: 'Customer' }] },
      }],
      nextCursor: 'linear-next',
    })
    expect(JSON.parse(fetch.mock.calls[0][1].body as string).variables).toEqual({ query: 'team:ENG', first: 25, after: 'linear-current' })
  })

  it('sends and returns Jira next-page tokens', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({
      issues: [{ id: 'jira-stable', key: 'APP-7', self: 'https://acme.atlassian.net/rest/api/3/issue/7', fields: { summary: 'Jira title' } }],
      total: 80,
      nextPageToken: 'jira-next',
      isLast: false,
    }))
    vi.stubGlobal('fetch', fetch)
    const page = await createJiraClient({ baseUrl: 'https://acme.atlassian.net', email: 'a@example.test', apiToken: 'test' })
      .searchIssuesPage('project = APP', { cursor: 'jira-current', pageSize: 25 })
    expect(page.nextCursor).toBe('jira-next')
    expect(page.total).toBe(80)
    expect(JSON.parse(fetch.mock.calls[0][1].body as string)).toMatchObject({ jql: 'project = APP', maxResults: 25, nextPageToken: 'jira-current' })
  })

  it('paginates GitHub search without treating pull requests as issues', async () => {
    const issue = { id: 7, node_id: 'github-stable', number: 7, title: 'Issue', body: 'Body', state: 'open', html_url: 'https://github.com/acme/app/issues/7', labels: [], milestone: null, created_at: '2026-01-01', updated_at: '2026-01-02' }
    const fetch = vi.fn().mockResolvedValue(Response.json({ total_count: 51, items: [issue, { ...issue, id: 8, node_id: 'pr-node', number: 8, pull_request: {} }] }))
    vi.stubGlobal('fetch', fetch)
    const page = await createGitHubIssuesClient({ token: 'test' }).searchIssuesPage('acme', 'app', 'is:open', { cursor: '2', pageSize: 25 })
    expect(page.items).toEqual([issue])
    expect(page.nextCursor).toBe('3')
    expect(fetch.mock.calls[0][0]).toContain('per_page=25&page=2')
  })
})

describe('explicit tracker-to-request mapping', () => {
  it('normalizes a Linear issue page', async () => {
    const page = await previewLinearPage({
      searchIssuesPage: async () => ({
        items: [{ id: 'linear-id', identifier: 'ENG-3', title: 'Title', description: 'Body', url: 'https://linear/ENG-3', priority: 1, state: { id: 'state', name: 'Todo' }, project: null, labels: { nodes: [{ id: 'l1', name: 'Bug' }] } }],
        nextCursor: 'next',
      }),
    }, { teamId: 'team-id', searchQuery: 'team:ENG', cursor: null })
    expect(page).toEqual({
      items: [{ provider: 'LINEAR', destination: 'team-id', remoteEntityId: 'linear-id', displayId: 'ENG-3', title: 'Title', description: 'Body', sourceUrl: 'https://linear/ENG-3', labels: ['Bug'], remoteStatus: { id: 'state', name: 'Todo' } }],
      nextCursor: 'next',
    })
  })

  it('converts Jira ADF into full plain text and preserves metadata', async () => {
    const page = await previewJiraPage({
      searchIssuesPage: async () => ({
        items: [{
          id: 'jira-id', key: 'APP-9', self: 'self', fields: {
            summary: 'Jira title',
            description: { version: 1, type: 'doc', content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'First paragraph' }] },
              { type: 'paragraph', content: [{ type: 'text', text: 'Second ' }, { type: 'text', text: 'paragraph' }] },
            ] },
            labels: ['Backend', 'Customer'], status: { id: 'status-id', name: 'Selected for Development' }, project: { id: 'project-id', key: 'APP' }, issuetype: { name: 'Story' },
          },
        }],
        nextCursor: null,
        total: 1,
      }),
    }, { projectKey: 'APP', projectId: 'project-id', baseUrl: 'HTTPS://ACME.ATLASSIAN.NET/', jql: 'project = APP', cursor: null })
    expect(page.items[0]).toEqual({
      provider: 'JIRA', destination: 'https://acme.atlassian.net|project-id', remoteEntityId: 'jira-id', displayId: 'APP-9', title: 'Jira title',
      description: 'First paragraph\n\nSecond paragraph', sourceUrl: 'https://acme.atlassian.net/browse/APP-9',
      labels: ['Backend', 'Customer'], remoteStatus: { id: 'status-id', name: 'Selected for Development' },
    })
  })

  it('uses the stable GitHub node ID and maps body, URL, labels, and state', async () => {
    const page = await previewGitHubPage({
      searchIssuesPage: async () => ({
        items: [{ id: 91, node_id: 'I_kwDO-stable', number: 12, title: 'GitHub title', body: 'GitHub body', state: 'open', html_url: 'https://github.com/acme/app/issues/12', labels: [{ id: 1, name: 'enhancement', color: 'fff' }], milestone: null, created_at: '2026-01-01', updated_at: '2026-01-02' }],
        nextCursor: null,
        total: 1,
      }),
    }, { repoFullName: 'acme/app', query: 'is:issue', cursor: null })
    expect(page.items[0]).toEqual({
      provider: 'GITHUB_ISSUES', destination: 'acme/app', remoteEntityId: 'I_kwDO-stable', displayId: '#12', title: 'GitHub title',
      description: 'GitHub body', sourceUrl: 'https://github.com/acme/app/issues/12', labels: ['enhancement'], remoteStatus: { name: 'open' },
    })
  })
})
