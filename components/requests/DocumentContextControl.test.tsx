import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DocumentContextControl } from './DocumentContextControl';
vi.mock('@/app/(dashboard)/requests/[id]/document-actions', () => ({ setDocumentContext: async () => ({ success: false, error: 'Wait for the active AI run.' }) }));
describe('supporting document controls', () => {
  it('shows unsupported format without offering a misleading selection', () => {
    render(<DocumentContextControl attachmentId="id" filename="report.pdf" mimeType="application/pdf" size={10} />);
    expect(screen.getByText(/AI context unsupported/)).toBeVisible();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
  it('shows server authorization failures without claiming selection succeeded', async () => {
    render(<DocumentContextControl attachmentId="id" filename="report.txt" mimeType="text/plain" size={10} />);
    await userEvent.click(screen.getByRole('checkbox'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Wait for the active AI run.');
    expect(screen.getByRole('checkbox')).not.toBeChecked();
  });
});
