import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { SETTINGS, settingLabel, useSettings } from './settings';
import { VERSION } from './version';

// The settings page over every other page. It has its own history entry, so the back
// gesture closes it; the page below keeps its state.
export default function SettingsPage() {
  const { settings, set, t, closeSettings } = useSettings();
  const closeRef = useRef(null);

  useEffect(() => {
    const opener = document.activeElement;
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = 'hidden';
    window.history.pushState({ ...(window.history.state || {}), settings: true }, '');
    const onPop = () => {
      if (!(window.history.state && window.history.state.settings)) closeSettings();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('popstate', onPop);
    document.addEventListener('keydown', onKey);
    closeRef.current.focus();
    return () => {
      root.style.overflow = before;
      window.removeEventListener('popstate', onPop);
      document.removeEventListener('keydown', onKey);
      if (opener && opener.focus) opener.focus({ preventScroll: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function close() {
    if (window.history.state && window.history.state.settings) window.history.back();
    else closeSettings();
  }

  return (
    <div className="settings-page" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <header className="settings-head on-dark">
        <div className="wrap flex items-center gap-1">
          <button ref={closeRef} type="button" className="sheet-close" onClick={close} aria-label={t('settings.close')}>
            <X className="h-6 w-6" aria-hidden="true" />
          </button>
          <h1 id="settings-title" className="font-display text-[1.3rem] font-bold tracking-tight">{t('settings.title')}</h1>
        </div>
      </header>
      <main className="wrap py-5">
        <div className="card divide-y divide-tinte/10 px-4">
          {SETTINGS.map(setting => (
            <fieldset key={setting.key} className="setting">
              <legend className="setting-label">{t(`settings.${setting.key}.label`)}</legend>
              <div className="choices">
                {setting.options.map(option => (
                  <label key={option} className="choice">
                    <input
                      type="radio"
                      name={`setting-${setting.key}`}
                      value={option}
                      checked={settings[setting.key] === option}
                      onChange={() => set(setting.key, option)}
                      className="sr-only"
                    />
                    <span lang={setting.key === 'language' ? option : undefined}>{settingLabel(setting, option)}</span>
                  </label>
                ))}
              </div>
              <p className="setting-hint">{t(`settings.${setting.key}.hint`)}</p>
            </fieldset>
          ))}
        </div>
        <p className="pt-5 text-center text-sm text-tinte/55">{t('settings.version', { version: VERSION })}</p>
      </main>
    </div>
  );
}
