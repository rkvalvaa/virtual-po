import { describe, expect, it } from 'vitest';
import { REQUEST_STATUSES } from '@/lib/types/database';
import { projectHistory, toExternalStatus } from './status';

describe('toExternalStatus', () => {
  it('maps every internal status to a client-safe label', () => {
    expect(Object.fromEntries(REQUEST_STATUSES.map(s => [s, toExternalStatus(s)]))).toEqual({
      DRAFT: 'Received', INTAKE_IN_PROGRESS: 'Received', PENDING_ASSESSMENT: 'Received',
      UNDER_REVIEW: 'Under review', NEEDS_INFO: 'Under review', DEFERRED: 'Under review',
      APPROVED: 'Planned', IN_BACKLOG: 'Planned', IN_PROGRESS: 'In progress', COMPLETED: 'Done', REJECTED: 'Closed',
    });
  });

  it('shows an archived request as closed whatever its status', () => {
    expect(toExternalStatus('IN_PROGRESS', true)).toBe('Closed');
  });
});

describe('projectHistory', () => {
  const at = (minute: number) => new Date(Date.UTC(2026, 8, 28, 10, minute)).toISOString();

  it('starts with receipt and review, then collapses repeats', () => {
    expect(projectHistory(at(0), [
      { status: 'NEEDS_INFO', at: at(5) },
      { status: 'UNDER_REVIEW', at: at(6) },
      { status: 'APPROVED', at: at(7) },
      { status: 'IN_BACKLOG', at: at(8) },
      { status: 'IN_PROGRESS', at: at(9) },
    ])).toEqual([
      { label: 'Received', at: at(0) },
      { label: 'Under review', at: at(0) },
      { label: 'Planned', at: at(7) },
      { label: 'In progress', at: at(9) },
    ]);
  });

  it('shows archiving as closed and restoring as the preserved status', () => {
    expect(projectHistory(at(0), [
      { archived: true, at: at(3) },
      { archived: false, status: 'UNDER_REVIEW', at: at(4) },
    ]).map(entry => entry.label)).toEqual(['Received', 'Under review', 'Closed', 'Under review']);
  });

  it('ignores events it cannot read', () => {
    expect(projectHistory(at(0), [{ status: 'SOMETHING_NEW', at: at(1) }]).map(e => e.label)).toEqual(['Received', 'Under review']);
  });
});
