import { useEffect, useRef } from 'react';
import { Monitor, Moon, Sun, X } from 'lucide-react';
import { SETTINGS, settingLabel, useSettings } from './settings';
import { VERSION } from './version';

const ICONS = { theme: { system: Monitor, light: Sun, dark: Moon } };

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
      <main className="wrap space-y-3 py-5">
        {SETTINGS.map(setting => {
          const icons = ICONS[setting.key];
          return (
            <fieldset key={setting.key} className="card p-4">
              <legend className="sr-only">{t(`settings.${setting.key}.label`)}</legend>
              <p className="font-display text-lg font-bold" aria-hidden="true">{t(`settings.${setting.key}.label`)}</p>
              <p className="mt-0.5 text-[0.9rem] text-tinte/70">{t(`settings.${setting.key}.hint`)}</p>
              <div className="segmented mt-3" style={{ '--options': setting.options.length }}>
                {setting.options.map(option => {
                  const Icon = icons && icons[option];
                  return (
                    <label key={option} className="segment">
                      <input
                        type="radio"
                        name={`setting-${setting.key}`}
                        value={option}
                        checked={settings[setting.key] === option}
                        onChange={() => set(setting.key, option)}
                        className="sr-only"
                      />
                      {Icon && <Icon className="h-5 w-5" aria-hidden="true" />}
                      <span lang={setting.key === 'language' ? option : undefined}>{settingLabel(setting, option)}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          );
        })}
        <p className="pt-2 text-center text-sm text-tinte/55">{t('settings.version', { version: VERSION })}</p>
      </main>
    </div>
  );
}
