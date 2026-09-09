"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { previewLinearImport, importLinearPage, resolveLinearImportConflict } from '@/app/(dashboard)/settings/linear-actions'
import { previewJiraImport, importJiraPage, resolveJiraImportConflict } from '@/app/(dashboard)/settings/jira-actions'
import { previewGitHubImport, importGitHubPage, resolveGitHubImportConflict } from '@/app/(dashboard)/settings/github-issues-actions'
import type { TrackerImportField, TrackerImportItem, TrackerImportItemResult, TrackerImportResult, TrackerProvider } from '@/lib/import/tracker-imports'
import type { TrackerPreviewPage } from '@/lib/import/provider-pages'

interface TrackerImportProps {
  provider: TrackerProvider
  destination: string
}

const providerName: Record<TrackerProvider, string> = {
  LINEAR: 'Linear',
  JIRA: 'Jira',
  GITHUB_ISSUES: 'GitHub',
}

const mapping = [
  ['Title', 'Title'],
  ['Description', 'Summary'],
  ['Source URL', 'External URL'],
  ['Labels', 'Tags'],
  ['Remote status', 'Import metadata (workflow status is unchanged)'],
] as const

type PreviewResponse = { success: true; page: TrackerPreviewPage } | { success: false; error: string }
type ImportResponse = { success: true; result: TrackerImportResult } | { success: false; error: string }
type ResolveResponse = { success: true; item: TrackerImportItemResult } | { success: false; error: string }

export function TrackerImport({ provider, destination: initialDestination }: TrackerImportProps) {
  const [destination, setDestination] = useState(initialDestination)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState<string | null>(null)
  const [history, setHistory] = useState<Array<string | null>>([])
  const [page, setPage] = useState<TrackerPreviewPage | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [result, setResult] = useState<TrackerImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)
  const name = providerName[provider]

  function previewInput(nextCursor: string | null) {
    if (provider === 'LINEAR') return { teamId: destination, searchQuery: query.trim() || undefined, cursor: nextCursor }
    if (provider === 'JIRA') return { projectKey: destination, jql: query.trim() || undefined, cursor: nextCursor }
    return { repoFullName: destination, query: query.trim() || undefined, cursor: nextCursor }
  }

  async function requestPreview(nextCursor: string | null): Promise<PreviewResponse> {
    if (provider === 'LINEAR') return previewLinearImport(previewInput(nextCursor) as Parameters<typeof previewLinearImport>[0])
    if (provider === 'JIRA') return previewJiraImport(previewInput(nextCursor) as Parameters<typeof previewJiraImport>[0])
    return previewGitHubImport(previewInput(nextCursor) as Parameters<typeof previewGitHubImport>[0])
  }

  async function requestImport(): Promise<ImportResponse> {
    const input = { ...previewInput(cursor), remoteEntityIds: selected }
    if (provider === 'LINEAR') return importLinearPage(input as Parameters<typeof importLinearPage>[0])
    if (provider === 'JIRA') return importJiraPage(input as Parameters<typeof importJiraPage>[0])
    return importGitHubPage(input as Parameters<typeof importGitHubPage>[0])
  }

  async function requestResolution(linkId: string, field: TrackerImportField, resolution: 'LOCAL' | 'REMOTE'): Promise<ResolveResponse> {
    if (provider === 'LINEAR') return resolveLinearImportConflict(linkId, { [field]: resolution })
    if (provider === 'JIRA') return resolveJiraImportConflict(linkId, { [field]: resolution })
    return resolveGitHubImportConflict(linkId, { [field]: resolution })
  }

  async function loadPage(nextCursor: string | null, nextHistory: Array<string | null>) {
    setError(null)
    setResult(null)
    setIsPending(true)
    try {
      const response = await requestPreview(nextCursor)
      if (!response.success) {
        setError(response.error)
        return
      }
      setCursor(nextCursor)
      setHistory(nextHistory)
      setPage(response.page)
      setSelected(response.page.items.map(item => item.remoteEntityId))
    } finally {
      setIsPending(false)
    }
  }

  async function importPage() {
    setError(null)
    setIsPending(true)
    try {
      const response = await requestImport()
      if (!response.success) {
        setError(response.error)
        return
      }
      setResult(response.result)
    } finally {
      setIsPending(false)
    }
  }

  async function resolve(linkId: string, field: TrackerImportField, resolution: 'LOCAL' | 'REMOTE') {
    setError(null)
    setIsPending(true)
    try {
      const response = await requestResolution(linkId, field, resolution)
      if (!response.success) {
        setError(response.error)
        return
      }
      setResult(current => current ? {
        ...current,
        items: current.items.map(item => item.linkId === linkId ? { ...item, conflicts: response.item.conflicts } : item),
      } : current)
    } finally {
      setIsPending(false)
    }
  }

  function toggle(item: TrackerImportItem) {
    setSelected(current => current.includes(item.remoteEntityId)
      ? current.filter(id => id !== item.remoteEntityId)
      : [...current, item.remoteEntityId])
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import backlog</CardTitle>
        <CardDescription>Preview tracker items and choose what becomes a request. Repeated imports update the same linked request.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-medium">
            {provider === 'LINEAR' ? 'Team ID' : provider === 'JIRA' ? 'Project key' : 'Repository'}
            <Input value={destination} onChange={event => { setDestination(event.target.value); setPage(null) }} />
          </label>
          <label className="grid gap-1 text-sm font-medium">
            {provider === 'LINEAR' ? 'Search query (optional)' : provider === 'JIRA' ? 'JQL (optional)' : 'Issue query (optional)'}
            <Input value={query} onChange={event => { setQuery(event.target.value); setPage(null) }} />
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm" aria-label={`${name} import field mapping`}>
            <thead><tr className="border-b"><th className="py-2 pr-4">Tracker field</th><th className="py-2">Request field</th></tr></thead>
            <tbody>{mapping.map(([source, target]) => <tr className="border-b" key={source}><td className="py-2 pr-4">{source}</td><td className="py-2 text-muted-foreground">{target}</td></tr>)}</tbody>
          </table>
        </div>

        <Button type="button" disabled={isPending || !destination.trim()} onClick={() => void loadPage(null, [])}>
          {isPending && !page ? 'Loading preview…' : `Preview ${name} issues`}
        </Button>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

        {page && <div className="space-y-4">
          <div className="space-y-3" aria-label={`${name} import preview`}>
            {page.items.length === 0 && <p className="text-sm text-muted-foreground">No issues found on this page.</p>}
            {page.items.map(item => <article key={item.remoteEntityId} className="rounded-md border p-3">
              <div className="flex items-start gap-3">
                <input type="checkbox" className="mt-1" aria-label={`Select ${item.displayId ?? item.title}`} checked={selected.includes(item.remoteEntityId)} onChange={() => toggle(item)} />
                <div className="min-w-0 flex-1 space-y-2">
                  <a className="font-medium underline-offset-4 hover:underline" href={item.sourceUrl} target="_blank" rel="noreferrer">{item.displayId ? `${item.displayId} ` : ''}{item.title}</a>
                  {item.description && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{item.description}</p>}
                  <div className="flex flex-wrap gap-2">
                    {item.remoteStatus && <Badge variant="outline">{item.remoteStatus.name}</Badge>}
                    {item.labels.map(label => <Badge variant="secondary" key={label}>{label}</Badge>)}
                  </div>
                </div>
              </div>
            </article>)}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" disabled={isPending || history.length === 0} onClick={() => {
              const nextHistory = history.slice(0, -1)
              void loadPage(history[history.length - 1] ?? null, nextHistory)
            }}>Previous page</Button>
            <span className="text-sm text-muted-foreground">Page {history.length + 1}{page.total !== undefined ? ` · ${page.total} total` : ''}</span>
            <Button type="button" variant="outline" disabled={isPending || !page.nextCursor} onClick={() => void loadPage(page.nextCursor, [...history, cursor])}>Next page</Button>
            <Button type="button" disabled={isPending || selected.length === 0} onClick={() => void importPage()}>{isPending ? 'Importing…' : `Import selected (${selected.length})`}</Button>
          </div>
        </div>}

        {result && <div className="space-y-3">
          <div role="status" className="flex flex-wrap gap-3 rounded-md border p-3 text-sm">
            <span>Created {result.created}</span><span>Updated {result.updated}</span><span>Skipped {result.skipped}</span><span>Failed {result.failed}</span>
          </div>
          {result.items.filter(item => item.error).map(item => <p className="text-sm text-destructive" key={`error-${item.remoteEntityId}`}>{item.displayId ? `${item.displayId}: ` : ''}{item.error}</p>)}
          {result.items.flatMap(item => item.conflicts.map(conflict => ({ item, conflict }))).map(({ item, conflict }) => <div className="space-y-2 rounded-md border border-amber-500/40 p-3 text-sm" key={`${item.linkId}-${conflict.field}`}>
            <p className="font-medium">{item.displayId ?? item.remoteEntityId}: local {conflict.field} changed after the last import</p>
            <p><span className="text-muted-foreground">Local:</span> {Array.isArray(conflict.localValue) ? conflict.localValue.join(', ') : conflict.localValue ?? '(empty)'}</p>
            <p><span className="text-muted-foreground">Tracker:</span> {Array.isArray(conflict.remoteValue) ? conflict.remoteValue.join(', ') : conflict.remoteValue ?? '(empty)'}</p>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={() => void resolve(item.linkId!, conflict.field, 'LOCAL')} aria-label={`Keep local ${conflict.field} for ${item.displayId ?? item.remoteEntityId}`}>Keep local</Button>
              <Button type="button" size="sm" disabled={isPending} onClick={() => void resolve(item.linkId!, conflict.field, 'REMOTE')} aria-label={`Use tracker ${conflict.field} for ${item.displayId ?? item.remoteEntityId}`}>Use tracker</Button>
            </div>
          </div>)}
        </div>}
      </CardContent>
    </Card>
  )
}
