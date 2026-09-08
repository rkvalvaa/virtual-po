import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NewRequestContent } from './NewRequestContent';
import { createNewRequest } from './actions';

vi.mock('./actions', () => ({ createNewRequest: vi.fn(), findSimilarToTitle: vi.fn(async () => []) }));

describe('starting an intake with no active templates', () => {
  beforeEach(() => { vi.mocked(createNewRequest).mockReset(); sessionStorage.clear(); });
  it('does not create requests during render and offers an explicit start', () => {
    vi.mocked(createNewRequest).mockImplementation(() => new Promise(() => {}));
    render(<NewRequestContent templates={[]} />);
    expect(screen.getByRole('button', { name: /start from scratch/i })).toBeVisible();
    expect(createNewRequest).not.toHaveBeenCalled();
  });

  it('lets users retry a failed start with the same idempotency key', async () => {
    const user = userEvent.setup();
    vi.mocked(createNewRequest).mockRejectedValueOnce(new Error('Temporary failure'));
    vi.mocked(createNewRequest).mockImplementationOnce(() => new Promise(() => {}));
    render(<NewRequestContent templates={[]} />);
    await user.click(screen.getByRole('button', { name: /start from scratch/i }));
    expect(await screen.findByText('Temporary failure')).toBeVisible();
    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(createNewRequest).toHaveBeenCalledTimes(2);
    expect(vi.mocked(createNewRequest).mock.calls[0][0]).toMatchObject({ idempotencyKey: expect.any(String) });
    expect(vi.mocked(createNewRequest).mock.calls[1][0]).toEqual(vi.mocked(createNewRequest).mock.calls[0][0]);
  });

  it('survives unmounting a pending start without losing its retry identity', async () => {
    const user = userEvent.setup();
    vi.mocked(createNewRequest).mockImplementation(() => new Promise(() => {}));
    const first = render(<NewRequestContent templates={[]} />);
    await user.click(screen.getByRole('button', { name: /start from scratch/i }));
    const firstArgs = vi.mocked(createNewRequest).mock.calls[0][0];
    first.unmount();
    await act(async () => { render(<NewRequestContent templates={[]} />); });
    await user.click(screen.getByRole('button', { name: /start from scratch/i }));
    expect(vi.mocked(createNewRequest).mock.calls[1][0]).toEqual(firstArgs);
  });
});
