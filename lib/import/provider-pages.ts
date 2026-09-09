import type { LinearIssue } from '@/lib/linear/client'
import type { JiraIssue } from '@/lib/jira/client'
import type { GitHubIssue } from '@/lib/github/issues-client'
import type { TrackerImportItem } from './tracker-imports'

export interface TrackerPreviewPage {
  items: TrackerImportItem[]
  nextCursor: string | null
  total?: number
}

function adfNodeText(node: unknown): string {
  if (!node || typeof node !== 'object') return ''
  const value = node as { type?: string; text?: unknown; content?: unknown[] }
  if (value.type === 'text') return typeof value.text === 'string' ? value.text : ''
  if (value.type === 'hardBreak') return '\n'
  const childText = Array.isArray(value.content) ? value.content.map(adfNodeText).join('') : ''
  return ['paragraph', 'heading', 'blockquote', 'listItem'].includes(value.type ?? '') ? `${childText}\n\n` : childText
}

export function jiraDescriptionToText(description: unknown): string | null {
  if (typeof description === 'string') return description.trim() || null
  const text = adfNodeText(description).replace(/\n{3,}/g, '\n\n').trim()
  return text || null
}

export async function previewLinearPage(
  client: { searchIssuesPage(query: string, teamId: string, options: { cursor?: string | null; pageSize?: number }): Promise<{ items: LinearIssue[]; nextCursor: string | null }> },
  input: { teamId: string; searchQuery?: string; cursor?: string | null; pageSize?: number },
): Promise<TrackerPreviewPage> {
  const page = await client.searchIssuesPage(input.searchQuery?.trim() || `team:${input.teamId}`, input.teamId, { cursor: input.cursor, pageSize: input.pageSize })
  return {
    items: page.items.map(issue => ({
      provider: 'LINEAR',
      destination: input.teamId,
      remoteEntityId: issue.id,
      displayId: issue.identifier,
      title: issue.title,
      description: issue.description,
      sourceUrl: issue.url,
      labels: issue.labels?.nodes.map(label => label.name) ?? [],
      remoteStatus: issue.state ? { id: issue.state.id, name: issue.state.name } : null,
    })),
    nextCursor: page.nextCursor,
  }
}

export async function previewJiraPage(
  client: { searchIssuesPage(jql: string, options: { cursor?: string | null; pageSize?: number }): Promise<{ items: JiraIssue[]; nextCursor: string | null; total: number }> },
  input: { projectKey: string; projectId?: string; baseUrl: string; jql?: string; cursor?: string | null; pageSize?: number },
): Promise<TrackerPreviewPage> {
  const jql = input.jql?.trim() || `project = ${input.projectKey} AND issuetype in (Story, Task, Bug) ORDER BY created DESC`
  const page = await client.searchIssuesPage(jql, { cursor: input.cursor, pageSize: input.pageSize })
  const parsedBaseUrl = new URL(input.baseUrl)
  const baseUrl = `${parsedBaseUrl.origin}${parsedBaseUrl.pathname.replace(/\/$/, '')}`
  const destination = `${baseUrl}|${input.projectId?.trim() || input.projectKey.trim()}`
  return {
    items: page.items.map(issue => ({
      provider: 'JIRA',
      destination,
      remoteEntityId: issue.id,
      displayId: issue.key,
      title: issue.fields.summary,
      description: jiraDescriptionToText(issue.fields.description),
      sourceUrl: `${baseUrl}/browse/${encodeURIComponent(issue.key)}`,
      labels: issue.fields.labels ?? [],
      remoteStatus: issue.fields.status ? { id: typeof issue.fields.status.id === 'string' ? issue.fields.status.id : null, name: issue.fields.status.name } : null,
    })),
    nextCursor: page.nextCursor,
    total: page.total,
  }
}

export async function previewGitHubPage(
  client: { searchIssuesPage(owner: string, repo: string, query: string, options: { cursor?: string | null; pageSize?: number }): Promise<{ items: GitHubIssue[]; nextCursor: string | null; total: number }> },
  input: { repoFullName: string; query?: string; cursor?: string | null; pageSize?: number },
): Promise<TrackerPreviewPage> {
  const [owner, repo, extra] = input.repoFullName.split('/')
  if (!owner || !repo || extra) throw new Error('Repository must use owner/repo format.')
  const page = await client.searchIssuesPage(owner, repo, input.query?.trim() || 'is:issue is:open', { cursor: input.cursor, pageSize: input.pageSize })
  return {
    items: page.items.map(issue => ({
      provider: 'GITHUB_ISSUES',
      destination: input.repoFullName,
      remoteEntityId: issue.node_id,
      displayId: `#${issue.number}`,
      title: issue.title,
      description: issue.body,
      sourceUrl: issue.html_url,
      labels: issue.labels.map(label => label.name),
      remoteStatus: { name: issue.state },
    })),
    nextCursor: page.nextCursor,
    total: page.total,
  }
}
