import { REQUEST_STATUSES, type RequestStatus } from '@/lib/types/database';

/** The only statuses a client ever sees; internal and tracker states stay internal. */
export type ExternalStatus = 'Received' | 'Under review' | 'Planned' | 'In progress' | 'Done' | 'Closed';

export function toExternalStatus(status: RequestStatus, archived = false): ExternalStatus {
  if (archived) return 'Closed';
  switch (status) {
    case 'DRAFT':
    case 'INTAKE_IN_PROGRESS':
    case 'PENDING_ASSESSMENT':
      return 'Received';
    case 'UNDER_REVIEW':
    case 'NEEDS_INFO':
    case 'DEFERRED':
      return 'Under review';
    case 'APPROVED':
    case 'IN_BACKLOG':
      return 'Planned';
    case 'IN_PROGRESS':
      return 'In progress';
    case 'COMPLETED':
      return 'Done';
    case 'REJECTED':
      return 'Closed';
    default: {
      const unreachable: never = status;
      throw new Error(`Unknown status ${unreachable}`);
    }
  }
}

/** A status-affecting activity entry: a new status, or an archive / restore. */
export interface StatusEvent { at: string; status?: string; archived?: boolean }
export interface HistoryEntry { label: ExternalStatus; at: string }

const isStatus = (value: unknown): value is RequestStatus => REQUEST_STATUSES.includes(value as RequestStatus);

/**
 * The client-safe status history of a portal request: dates and labels only,
 * never actors or reasons. Portal requests are created under review, so the
 * history always opens with "Received" and "Under review".
 */
export function projectHistory(createdAt: string, events: StatusEvent[]): HistoryEntry[] {
  const history: HistoryEntry[] = [{ label: 'Received', at: createdAt }, { label: 'Under review', at: createdAt }];
  for (const event of events) {
    const label = event.archived ? 'Closed' : isStatus(event.status) ? toExternalStatus(event.status) : null;
    if (label && history[history.length - 1].label !== label) history.push({ label, at: event.at });
  }
  return history;
}
