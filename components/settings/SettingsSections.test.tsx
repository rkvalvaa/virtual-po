import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsNavigation, SettingsPanel, SettingsSections } from './SettingsSections';

function renderSections() {
  return render(
    <SettingsSections defaultValue="organization">
      <SettingsNavigation />
      <div>
        <SettingsPanel value="organization">Organization content</SettingsPanel>
        <SettingsPanel value="members">Member content</SettingsPanel>
        <SettingsPanel value="repositories">Repository content</SettingsPanel>
      </div>
    </SettingsSections>,
  );
}

describe('Settings section deep links', () => {
  beforeEach(() => window.history.replaceState(null, '', '/settings'));

  it('opens the section named by the initial URL hash', async () => {
    window.history.replaceState(null, '', '/settings#members');
    renderSections();
    expect(await screen.findByRole('region', { name: 'Members settings' })).toHaveTextContent('Member content');
    expect(screen.queryByRole('region', { name: 'Organization settings' })).not.toBeInTheDocument();
  });

  it('updates the URL hash when desktop navigation selects a section', async () => {
    const user = userEvent.setup();
    renderSections();
    await user.click(screen.getByRole('button', { name: 'Members' }));
    expect(window.location.hash).toBe('#members');
    expect(screen.getByRole('region', { name: 'Members settings' })).toBeInTheDocument();
  });

  it('tracks browser hash changes and ignores unknown sections', async () => {
    renderSections();
    window.history.replaceState(null, '', '/settings#repositories');
    fireEvent(window, new HashChangeEvent('hashchange'));
    expect(await screen.findByRole('region', { name: 'Repositories settings' })).toBeInTheDocument();

    window.history.replaceState(null, '', '/settings#unknown');
    fireEvent(window, new HashChangeEvent('hashchange'));
    expect(screen.getByRole('region', { name: 'Repositories settings' })).toBeInTheDocument();
  });
});
