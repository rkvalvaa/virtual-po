import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ScoringSettings } from './ScoringSettings';
import { defaultScoringConfig } from '@/config/scoring';
import { updateScoringConfiguration } from '@/app/(dashboard)/settings/scoring-actions';
vi.mock('@/app/(dashboard)/settings/scoring-actions', () => ({ updateScoringConfiguration: vi.fn() }));
it('saves a new policy version and explains historical behavior', async () => {
  const user = userEvent.setup();
  render(<ScoringSettings policy={{ version: 0, config: defaultScoringConfig }} userRole="ADMIN" />);
  await user.selectOptions(screen.getByLabelText('Framework'), 'CUSTOM');
  vi.mocked(updateScoringConfiguration).mockResolvedValue({ success: true, policy: { version: 1, config: { ...defaultScoringConfig, framework: 'CUSTOM' } } });
  await user.click(screen.getByRole('button', { name: 'Save scoring policy' }));
  expect(updateScoringConfiguration).toHaveBeenCalledWith(expect.objectContaining({ framework: 'CUSTOM' }), 0);
  expect(await screen.findByRole('status')).toHaveTextContent('version 1');
  expect(screen.getByText(/Historical assessments retain/)).toBeInTheDocument();
});
