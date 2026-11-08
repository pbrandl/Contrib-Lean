import { render as rtlRender } from '@testing-library/react';
import { SettingsProvider } from './settings';
import SettingsPage from './SettingsPage';
import { useSettings } from './settings';

// Pages need the settings around them, as in App.js; the settings page opens over them.
function WithSettings({ children }) {
  const { open } = useSettings();
  return (
    <>
      {children}
      {open && <SettingsPage />}
    </>
  );
}

export function render(ui, options) {
  return rtlRender(<SettingsProvider><WithSettings>{ui}</WithSettings></SettingsProvider>, options);
}
