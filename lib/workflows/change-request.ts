import { canAccess } from '@/lib/auth/rbac';
import type { UserRole } from '@/lib/types/database';

/**
 * The internal change-request workflow, defined in code and versioned (CCT-2434).
 * A request stays on the version it started with, so a later version must be
 * added alongside this one, never edited into it.
 */
export const CHANGE_STATES = [
  'SUBMITTED', 'ASSESSING', 'AWAITING_APPROVAL', 'SCHEDULED', 'IMPLEMENTING', 'VALIDATING', 'CLOSED', 'REJECTED',
] as const;
export type ChangeState = typeof CHANGE_STATES[number];

/** Details recorded on the request (feature_requests.workflow_data). */
export const CHANGE_FIELDS = {
  implementationPlan: 'Implementation plan',
  implementationEvidence: 'Implementation evidence',
  validationNotes: 'Validation notes',
} as const;
export type ChangeField = keyof typeof CHANGE_FIELDS;

export interface WorkflowTransition {
  from: ChangeState;
  to: ChangeState;
  label: string;
  minRole: UserRole;
  /** Must be recorded once the move is made; the move may supply them. */
  requires: ChangeField[];
  /** A reason must accompany this move; it is kept in the activity log. */
  reason: boolean;
}

export interface WorkflowDefinition {
  version: number;
  initial: ChangeState;
  states: Record<ChangeState, string>;
  transitions: WorkflowTransition[];
}

const move = (from: ChangeState, to: ChangeState, label: string, minRole: UserRole,
  options: { requires?: ChangeField[]; reason?: boolean } = {}): WorkflowTransition =>
  ({ from, to, label, minRole, requires: options.requires ?? [], reason: options.reason ?? false });

// Approval is ADMIN-only until service groups (S3) add group leads.
const V1: WorkflowDefinition = {
  version: 1,
  initial: 'SUBMITTED',
  states: {
    SUBMITTED: 'Submitted', ASSESSING: 'Assessing', AWAITING_APPROVAL: 'Awaiting approval', SCHEDULED: 'Scheduled',
    IMPLEMENTING: 'Implementing', VALIDATING: 'Validating', CLOSED: 'Closed', REJECTED: 'Rejected',
  },
  transitions: [
    move('SUBMITTED', 'ASSESSING', 'Start assessment', 'REVIEWER'),
    move('SUBMITTED', 'REJECTED', 'Reject', 'REVIEWER', { reason: true }),
    move('ASSESSING', 'AWAITING_APPROVAL', 'Request approval', 'REVIEWER', { requires: ['implementationPlan'] }),
    move('ASSESSING', 'REJECTED', 'Reject', 'REVIEWER', { reason: true }),
    move('AWAITING_APPROVAL', 'SCHEDULED', 'Approve', 'ADMIN', { requires: ['implementationPlan'] }),
    move('AWAITING_APPROVAL', 'ASSESSING', 'Send back', 'ADMIN', { reason: true }),
    move('AWAITING_APPROVAL', 'REJECTED', 'Reject', 'ADMIN', { reason: true }),
    move('SCHEDULED', 'IMPLEMENTING', 'Start implementation', 'REVIEWER'),
    move('SCHEDULED', 'REJECTED', 'Cancel', 'ADMIN', { reason: true }),
    move('IMPLEMENTING', 'VALIDATING', 'Submit for validation', 'REVIEWER', { requires: ['implementationEvidence'] }),
    move('VALIDATING', 'CLOSED', 'Close', 'REVIEWER', { requires: ['validationNotes'] }),
    move('VALIDATING', 'IMPLEMENTING', 'Validation failed', 'REVIEWER', { reason: true }),
    move('CLOSED', 'ASSESSING', 'Reopen', 'REVIEWER', { reason: true }),
    move('REJECTED', 'ASSESSING', 'Reopen', 'REVIEWER', { reason: true }),
  ],
};

const WORKFLOWS: Record<number, WorkflowDefinition> = { 1: V1 };
export const CURRENT_CHANGE_WORKFLOW_VERSION = 1;

export function changeWorkflow(version: number): WorkflowDefinition {
  const definition = WORKFLOWS[version];
  if (!definition) throw new Error(`Unknown change-request workflow version ${version}.`);
  return definition;
}

export function findTransition(definition: WorkflowDefinition, from: string, to: string): WorkflowTransition | undefined {
  return definition.transitions.find(t => t.from === from && t.to === to);
}

export function allowedTransitions(definition: WorkflowDefinition, from: string, role: UserRole): WorkflowTransition[] {
  return definition.transitions.filter(t => t.from === from && canAccess(role, t.minRole));
}
