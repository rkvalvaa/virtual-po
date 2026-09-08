import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WebhookSettings } from './WebhookSettings';
import { createWebhookAction, testWebhookAction } from '@/app/(dashboard)/settings/api-actions';
vi.mock('@/app/(dashboard)/settings/api-actions', () => ({
  createWebhookAction: vi.fn(), updateWebhookAction: vi.fn(), deleteWebhookAction: vi.fn(), testWebhookAction: vi.fn(),
  webhookDeliveryHistoryAction: vi.fn(async () => ({ success: true, deliveries: [] })), redeliverWebhookAction: vi.fn(),
  rotateWebhookSecretAction: vi.fn(async () => ({ success: true, secret: 'rotated-signing-secret' })),
}));
const webhooks = [{ id: 'webhook-id', url: 'https://example.com/hook', events: ['request.created'], isActive: true, lastTriggeredAt: null, failureCount: 0, createdAt: '2026-01-01' }];
beforeEach(() => { vi.mocked(createWebhookAction).mockResolvedValue({ success: true, secret: 'new-signing-secret' }); });
it.each(['STAKEHOLDER', 'REVIEWER'])('does not expose admin controls or secrets to %s', role => {
  render(<WebhookSettings webhooks={webhooks} userRole={role} />);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Signing secret')).not.toBeInTheDocument();
});
it('shows the new secret once, supports copy, and clears it after dismissal', async () => {
  const user = userEvent.setup();
  render(<WebhookSettings webhooks={webhooks} userRole="ADMIN" />);
  await user.click(screen.getByRole('button', { name: 'Add Webhook' }));
  await user.type(screen.getByLabelText('Payload URL'), 'https://example.com/new');
  await user.click(screen.getByLabelText('Request Created'));
  await user.click(screen.getByRole('button', { name: 'Create Webhook' }));
  expect(await screen.findByLabelText('Signing secret')).toHaveValue('new-signing-secret');
  await user.click(screen.getByRole('button', { name: 'Copy secret' }));
  expect(await navigator.clipboard.readText()).toBe('new-signing-secret');
  await user.click(screen.getByRole('button', { name: 'I saved the secret' }));
  expect(screen.queryByLabelText('Signing secret')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Deliveries' }));
  expect(await screen.findByText('No deliveries yet.')).toBeVisible();
  expect(screen.queryByDisplayValue('new-signing-secret')).not.toBeInTheDocument();
});
it('shows the tracked failure from Test', async () => {
  vi.mocked(testWebhookAction).mockResolvedValue({ success: false, status: 'PENDING', error: 'Test delivery pending (HTTP 503). View delivery history for retry status.' });
  const user = userEvent.setup();
  render(<WebhookSettings webhooks={webhooks} userRole="ADMIN" />);
  await user.click(screen.getByRole('button', { name: 'Test' }));
  expect(await screen.findByRole('status')).toHaveTextContent('HTTP 503');
  expect(screen.queryByText(/delivered successfully/)).not.toBeInTheDocument();
});
it('explains immediate rotation before revealing the new secret', async () => {
  const user = userEvent.setup();
  render(<WebhookSettings webhooks={webhooks} userRole="ADMIN" />);
  await user.click(screen.getByRole('button', { name: 'Rotate secret' }));
  expect(screen.getByText(/old secret will stop/)).toBeVisible();
  expect(screen.queryByLabelText('Signing secret')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Rotate signing secret' }));
  expect(await screen.findByLabelText('Signing secret')).toHaveValue('rotated-signing-secret');
});
