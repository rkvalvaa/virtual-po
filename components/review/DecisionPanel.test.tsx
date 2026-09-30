import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DecisionPanel } from './DecisionPanel';

const action = vi.hoisted(() => ({ submitDecision: vi.fn(), transitionStatus: vi.fn() }));
vi.mock('@/app/(dashboard)/requests/[id]/actions', () => action);

const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

function renderPanel(currentStatus: string) {
  render(<DecisionPanel requestId="request-1" currentStatus={currentStatus} userRole="REVIEWER" decisions={[]} />);
}

describe('DecisionPanel lifecycle actions', () => {
  beforeEach(() => {
    action.submitDecision.mockReset();
    action.transitionStatus.mockReset();
    refresh.mockReset();
  });

  it('should move the request to the backlog without asking for a rationale', async () => {
    action.transitionStatus.mockResolvedValue(undefined);
    renderPanel('APPROVED');

    await userEvent.click(screen.getByRole('button', { name: 'Move to Backlog' }));

    expect(action.transitionStatus).toHaveBeenCalledWith('request-1', 'IN_BACKLOG');
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('should show an error when the server refuses the move', async () => {
    action.transitionStatus.mockRejectedValue(new Error('Cannot transition'));
    renderPanel('IN_BACKLOG');

    await userEvent.click(screen.getByRole('button', { name: 'Start Work' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't update/i);
  });

  it('should show an error when a decision is refused', async () => {
    action.submitDecision.mockRejectedValue(new Error('Approval chain active'));
    renderPanel('UNDER_REVIEW');

    await userEvent.click(screen.getByRole('button', { name: 'Defer' }));
    await userEvent.type(screen.getByRole('textbox'), 'Not this quarter');
    await userEvent.click(screen.getByRole('button', { name: 'Submit Decision' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't update/i);
  });
});
