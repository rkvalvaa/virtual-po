import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DocumentCitations } from './DocumentCitations';
const id = '00000000-0000-4000-8000-000000000001';
const citation = { attachmentId: id, startLine: 1, endLine: 2, claim: 'Supports customer demand', filename: 'evidence.md', contentHash: 'hash' };
describe('assessment sources', () => {
  it('links cited claims to the protected attachment route and displays line references', () => {
    render(<DocumentCitations value={[citation]} attachmentIds={[id]} />);
    expect(screen.getByText('Supports customer demand')).toBeVisible();
    expect(screen.getByRole('link', { name: /evidence.md.*1–2/ })).toHaveAttribute('href', `/api/attachments/${id}`);
  });
  it('marks deleted source files unavailable while preserving the assessment conclusion', () => {
    render(<DocumentCitations value={[citation]} attachmentIds={[]} />);
    expect(screen.getByText(/Source removed/)).toBeVisible();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
