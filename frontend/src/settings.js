import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { DEMO } from './demo';
import { LANGUAGES, browserLanguage, setLanguage, t } from './i18n';
import { legacyMode, settingsStore } from './lib';

// The settings of this device, for every page. A new setting: one entry here and its texts
// in i18n (settings.<key>.label, .hint and one per option); the settings page shows it.
// `optionLabel`: for options that need no translation (the language names).
export const SETTINGS = [
  { key: 'theme', options: ['system', 'light', 'dark'], initial: () => 'system' },
  {
    key: 'language',
    options: LANGUAGES.map(l => l.code),
    initial: browserLanguage,
    optionLabel: (code) => LANGUAGES.find(l => l.code === code).name
  },
  // Members chose this on their page before version 2 (franzwerk.mode).
  { key: 'amounts', options: ['netto', 'brutto'], initial: () => (legacyMode.get() === 'brutto' ? 'brutto' : 'netto') }
];

export const settingLabel = (setting, option) => (setting.optionLabel ? setting.optionLabel(option) : t(`settings.${setting.key}.${option}`));

function readSettings() {
  const saved = settingsStore.get() || {};
  const values = {};
  for (const s of SETTINGS) values[s.key] = s.options.includes(saved[s.key]) ? saved[s.key] : s.initial();
  return values;
}

const darkQuery = () => (typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null);

function applyTheme(theme) {
  const query = darkQuery();
  const dark = theme === 'dark' || (theme === 'system' && !!query && query.matches);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}

const SettingsContext = createContext(null);

// `open`: the settings page is shown (by SettingsPage, see App.js).
export function SettingsProvider({ children }) {
  const [values, setValues] = useState(() => {
    const initial = readSettings();
    setLanguage(initial.language);
    return initial;
  });
  const [open, setOpen] = useState(false);

  const set = useCallback((key, value) => {
    setValues(prev => {
      const next = { ...prev, [key]: value };
      settingsStore.set(next);
      return next;
    });
    if (key === 'language') setLanguage(value);
  }, []);

  useEffect(() => {
    applyTheme(values.theme);
    if (values.theme !== 'system') return undefined;
    const query = darkQuery();
    if (!query || !query.addEventListener) return undefined;
    const onChange = () => applyTheme('system');
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [values.theme]);

  useEffect(() => {
    // The demo carries no organisation's name (see Logo in ui.js).
    document.title = DEMO ? `${t('app.name')} Demo` : t('app.title');
  }, [values.language]);

  const value = useMemo(() => ({
    settings: values,
    set,
    t,
    open,
    openSettings: () => setOpen(true),
    closeSettings: () => setOpen(false)
  }), [values, set, open]);

  return createElement(SettingsContext.Provider, { value }, children);
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings needs a SettingsProvider around the app');
  return context;
}

// The translation function; components that use it show the new language right away.
export const useT = () => useSettings().t;

// Netto or brutto, from the settings, and a toggle for the quick switch on the pages.
export function useAmountMode() {
  const { settings, set } = useSettings();
  const mode = settings.amounts;
  const toggle = useCallback(() => set('amounts', mode === 'brutto' ? 'netto' : 'brutto'), [mode, set]);
  return [mode, toggle];
}
