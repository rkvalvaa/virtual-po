import { expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PriorityBadge } from './PriorityBadge';
import { defaultScoringConfig } from '@/config/scoring';
it('labels a score using the historical assessment policy', () => {
  render(<PriorityBadge score={80} config={{ ...defaultScoringConfig, thresholds: { highPriority: 90, mediumPriority: 70 } }} />);
  expect(screen.getByText('80 - Medium')).toBeInTheDocument();
});
