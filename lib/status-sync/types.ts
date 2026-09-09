import type { LinearIssue } from '@/lib/linear/client'
import type { RequestStatus } from '@/lib/types/database'

export interface StatusMapping {
  remoteStatusId: string
  remoteStatusName: string
  targetStatus: RequestStatus
}

export interface LinearStatusSyncClient {
  listUpdatedIssuesPage(
    teamId: string,
    updatedAfter: Date,
    options: { cursor?: string | null; pageSize?: number },
  ): Promise<{ items: LinearIssue[]; nextCursor: string | null }>
  getIssue(issueId: string): Promise<LinearIssue>
}

export interface StatusSyncResult {
  observed: number
  applied: number
  skipped: number
  conflicts: number
  failed: number
  deduplicated: number
}
