import type { RequestStatus } from '@/lib/types/database';
import { searchFeatureRequests } from './feature-requests';

export const QUEUE_STATUSES: Record<'review' | 'backlog', RequestStatus[]> = {
  review: ['UNDER_REVIEW', 'NEEDS_INFO'],
  backlog: ['APPROVED', 'IN_BACKLOG', 'IN_PROGRESS', 'COMPLETED'],
};
export type QueueParams = Record<string, string | string[] | undefined>;

export async function listRequestQueue(orgId: string, queue: 'review' | 'backlog', params: QueueParams) {
  const allowed = QUEUE_STATUSES[queue];
  const status = typeof params.status === 'string' && allowed.includes(params.status as RequestStatus) ? params.status as RequestStatus : undefined;
  const search = typeof params.search === 'string' ? params.search.trim().slice(0, 200) : '';
  const requestedOffset = Number(params.offset);
  const limit = 25;
  let offset = Number.isSafeInteger(requestedOffset) && requestedOffset > 0 ? Math.floor(Math.min(requestedOffset, 1_000_000) / limit) * limit : 0;
  const filters = { statuses: status ? [status] : allowed, search, sortBy: 'priority_score' as const, sortOrder: 'desc' as const, limit };
  let result = await searchFeatureRequests(orgId, { ...filters, offset });
  if (offset >= result.total && offset > 0) {
    offset = Math.max(0, Math.ceil(result.total / limit) - 1) * limit;
    result = await searchFeatureRequests(orgId, { ...filters, offset });
  }
  return { ...result, offset, limit, search, status, statuses: allowed };
}
