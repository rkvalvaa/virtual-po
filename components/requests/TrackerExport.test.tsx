import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { TrackerExport } from './TrackerExport';
const sync = vi.hoisted(() => vi.fn(async () => ({ success: false, error: 'Connection unavailable' })));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/app/(dashboard)/settings/linear-actions', () => ({ syncEpicToLinear: sync }));
vi.mock('@/app/(dashboard)/settings/jira-actions', () => ({ syncEpicToJira: sync }));
vi.mock('@/app/(dashboard)/settings/github-issues-actions', () => ({ syncToGitHubIssues: sync }));
describe('tracker export progress', () => {
  it('keeps resume available after parent creation and displays failures', async () => {
    render(<TrackerExport requestId="request" provider="LINEAR" url="https://linear.app/project" initial={{ success: false, status: 'partial', items: [{ id: 'parent', entityId: 'parent', kind: 'EPIC', title: 'Parent', body: '', state: 'complete' }, { id: 'child', entityId: 'child', kind: 'STORY', title: 'Child', body: '', state: 'unknown', error: 'Creation outcome unknown' }] }} />);
    expect(screen.getByRole('status')).toHaveTextContent('Partial export');
    await userEvent.click(screen.getByRole('button', { name: 'Retry / resume export' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Connection unavailable');
    expect(screen.getByRole('link', { name: 'View in Linear' })).toBeInTheDocument();
  });
});
