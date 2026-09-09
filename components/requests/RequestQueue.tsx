import { Suspense } from 'react';
import Link from 'next/link';
import { requireAuth } from '@/lib/auth/session';
import { listRequestQueue, type QueueParams } from '@/lib/db/queries/request-queue';
import { getVoteSummariesByRequestIds } from '@/lib/db/queries/votes';
import { BulkRequestTable } from './BulkRequestTable';
import { Pagination } from '@/components/shared/Pagination';
import { ExportButton } from '@/components/shared/ExportButton';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { assessmentScoringPolicy } from '@/config/scoring-policy';

export async function RequestQueue({ queue, searchParams }: { queue: 'review' | 'backlog'; searchParams: Promise<QueueParams> }) {
  const session = await requireAuth();
  if (!session.user.orgId) return <p>No organization found. Please contact an administrator.</p>;
  const result = await listRequestQueue(session.user.orgId, queue, await searchParams);
  const voteSummaries = await getVoteSummariesByRequestIds(result.requests.map(row => row.id));
  const title = queue === 'review' ? 'Review Queue' : 'Backlog';
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><div className="flex items-center gap-3"><h1 className="text-2xl font-bold tracking-tight">{title}</h1><Badge variant="secondary">{result.total}</Badge></div>
        <p className="mt-1 text-sm text-muted-foreground">{queue === 'review' ? 'Requests pending review and decision.' : 'Approved, in-progress, and completed requests.'} Sorted by priority score.</p></div>
      {queue === 'backlog' && <ExportButton exportUrl="/api/export/backlog" filename="backlog.csv" />}
    </div>
    <form action={`/${queue}`} className="flex flex-wrap items-end gap-3">
      <div className="min-w-0 flex-1"><label htmlFor="queue-search" className="text-sm">Search requests</label><Input key={result.search} id="queue-search" name="search" maxLength={200} defaultValue={result.search} /></div>
      <div><label htmlFor="queue-status" className="block text-sm">Status</label><select key={result.status ?? ''} id="queue-status" name="status" defaultValue={result.status ?? ''} className="rounded-md border bg-background p-2 text-sm">
        <option value="">All queue statuses</option>{result.statuses.map(status => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}
      </select></div>
      <Button type="submit">Apply filters</Button><Link href={`/${queue}`} className="text-sm underline">Clear filters</Link>
    </form>
    {!result.requests.length ? <p className="py-8 text-center text-sm text-muted-foreground">No matching requests in this queue.</p> : <>
      <p className="text-xs text-muted-foreground">Select all applies to this page only. Changing pages or filters clears selection.</p>
      <BulkRequestTable key={`${result.search}:${result.status ?? ''}:${result.offset}:${result.requests.map(row => row.id).join(',')}`}
        requests={result.requests.map(row => ({ id: row.id, title: row.title, status: row.status, priorityScore: row.priorityScore, scoringConfig: assessmentScoringPolicy(row.assessmentData).config, qualityScore: row.qualityScore, complexity: row.complexity, tags: row.tags, createdAt: row.createdAt.toISOString() }))}
        voteSummaries={voteSummaries.map(row => ({ requestId: row.requestId, averageScore: row.averageScore, voteCount: row.voteCount }))}
        columns={['complexity']} statusActions={queue === 'review' ? [
          { label: 'Approve', targetStatus: 'APPROVED' }, { label: 'Reject', targetStatus: 'REJECTED' }, { label: 'Defer', targetStatus: 'DEFERRED' },
        ] : [{ label: 'Start Work', targetStatus: 'IN_PROGRESS' }, { label: 'Complete', targetStatus: 'COMPLETED' }]} />
    </>}
    <Suspense><Pagination total={result.total} limit={result.limit} offset={result.offset} /></Suspense>
  </div>;
}
