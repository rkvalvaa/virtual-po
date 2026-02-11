import type { RequestStatus, UserRole } from '@/lib/types/database';

// Valid status transitions map
const TRANSITIONS: Record<RequestStatus, RequestStatus[]> = {
  DRAFT: ['INTAKE_IN_PROGRESS'],
  INTAKE_IN_PROGRESS: ['PENDING_ASSESSMENT', 'DRAFT'],
  PENDING_ASSESSMENT: ['UNDER_REVIEW'],
  UNDER_REVIEW: ['APPROVED', 'REJECTED', 'DEFERRED', 'NEEDS_INFO'],
  NEEDS_INFO: ['UNDER_REVIEW', 'DEFERRED'],
  APPROVED: ['IN_BACKLOG'],
  REJECTED: [],
  DEFERRED: ['UNDER_REVIEW'],
  IN_BACKLOG: ['IN_PROGRESS'],
  IN_PROGRESS: ['COMPLETED', 'IN_BACKLOG'],
  COMPLETED: [],
};

export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function getValidTransitions(status: RequestStatus): RequestStatus[] {
  return TRANSITIONS[status] ?? [];
}

interface StatusAction {
  label: string;
  targetStatus: RequestStatus;
  variant: 'default' | 'destructive' | 'outline' | 'secondary';
  requiredRole: UserRole;
}

export function getAvailableActions(status: RequestStatus, userRole: UserRole): StatusAction[] {
  const roleLevel: Record<UserRole, number> = { STAKEHOLDER: 0, REVIEWER: 1, ADMIN: 2 };
  const level = roleLevel[userRole];

  const allActions: Record<string, StatusAction> = {
    start_intake: { label: 'Start Intake', targetStatus: 'INTAKE_IN_PROGRESS', variant: 'default', requiredRole: 'STAKEHOLDER' },
    submit_for_assessment: { label: 'Submit for Assessment', targetStatus: 'PENDING_ASSESSMENT', variant: 'default', requiredRole: 'STAKEHOLDER' },
    approve: { label: 'Approve', targetStatus: 'APPROVED', variant: 'default', requiredRole: 'REVIEWER' },
    reject: { label: 'Reject', targetStatus: 'REJECTED', variant: 'destructive', requiredRole: 'REVIEWER' },
    defer: { label: 'Defer', targetStatus: 'DEFERRED', variant: 'outline', requiredRole: 'REVIEWER' },
    request_info: { label: 'Request Info', targetStatus: 'NEEDS_INFO', variant: 'secondary', requiredRole: 'REVIEWER' },
    move_to_backlog: { label: 'Move to Backlog', targetStatus: 'IN_BACKLOG', variant: 'default', requiredRole: 'REVIEWER' },
    start_work: { label: 'Start Work', targetStatus: 'IN_PROGRESS', variant: 'default', requiredRole: 'REVIEWER' },
    mark_complete: { label: 'Mark Complete', targetStatus: 'COMPLETED', variant: 'default', requiredRole: 'REVIEWER' },
    reopen: { label: 'Reopen Review', targetStatus: 'UNDER_REVIEW', variant: 'outline', requiredRole: 'REVIEWER' },
    return_to_backlog: { label: 'Return to Backlog', targetStatus: 'IN_BACKLOG', variant: 'outline', requiredRole: 'REVIEWER' },
  };

  const statusActions: Record<RequestStatus, string[]> = {
    DRAFT: ['start_intake'],
    INTAKE_IN_PROGRESS: [],
    PENDING_ASSESSMENT: [],
    UNDER_REVIEW: ['approve', 'reject', 'defer', 'request_info'],
    NEEDS_INFO: ['reopen', 'defer'],
    APPROVED: ['move_to_backlog'],
    REJECTED: [],
    DEFERRED: ['reopen'],
    IN_BACKLOG: ['start_work'],
    IN_PROGRESS: ['mark_complete', 'return_to_backlog'],
    COMPLETED: [],
  };

  const actionKeys = statusActions[status] ?? [];
  return actionKeys
    .map((key) => allActions[key])
    .filter((action) => action && level >= roleLevel[action.requiredRole]);
}

export function formatStatus(status: string): string {
  return status
    .split('_')
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
}
