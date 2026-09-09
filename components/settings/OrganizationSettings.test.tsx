import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OrganizationSettings } from './OrganizationSettings';
import { renameOrganization } from '@/app/(dashboard)/settings/organization-actions';
vi.mock('@/app/(dashboard)/settings/organization-actions', () => ({ renameOrganization: vi.fn() }));
const organization = { name: 'Original', slug: 'stable-slug', createdAt: '2026-01-01' };
describe('organization name editor', () => {
  it('cancels without saving and shows a successful saved name', async () => {
    const user = userEvent.setup();
    render(<OrganizationSettings organization={organization} userRole="ADMIN" />);
    await user.click(screen.getByRole('button', { name: 'Edit name' }));
    await user.clear(screen.getByLabelText('Organization name'));
    await user.type(screen.getByLabelText('Organization name'), 'Discard');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(renameOrganization).not.toHaveBeenCalled();
    expect(screen.getByText('Original')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Edit name' }));
    await user.clear(screen.getByLabelText('Organization name'));
    await user.type(screen.getByLabelText('Organization name'), 'Renamed');
    vi.mocked(renameOrganization).mockResolvedValue({ success: true, name: 'Renamed' });
    await user.click(screen.getByRole('button', { name: 'Save name' }));
    expect(await screen.findByText('Renamed')).toBeInTheDocument();
    expect(screen.getByText('stable-slug')).toBeInTheDocument();
  });
  it('keeps the draft and reports server errors', async () => {
    const user = userEvent.setup();
    render(<OrganizationSettings organization={organization} userRole="ADMIN" />);
    await user.click(screen.getByRole('button', { name: 'Edit name' }));
    vi.mocked(renameOrganization).mockResolvedValue({ success: false, error: 'Save failed' });
    await user.click(screen.getByRole('button', { name: 'Save name' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Save failed');
    expect(screen.getByLabelText('Organization name')).toHaveValue('Original');
  });
  it('shows read-only details for non-admins', () => {
    render(<OrganizationSettings organization={organization} userRole="REVIEWER" />);
    expect(screen.queryByRole('button', { name: 'Edit name' })).not.toBeInTheDocument();
  });
});
