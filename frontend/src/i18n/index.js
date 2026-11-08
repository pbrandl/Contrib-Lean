import de from './de';
import en from './en';
import es from './es';

// Every text of the app lives in one file per language. A new language: copy de.js,
// translate it, add it here. Keys missing in a language fall back to German.
// A message is a string with {placeholders}, or { one, other } for a count ({count}).
export const LANGUAGES = [
  { code: 'de', name: 'Deutsch', locale: 'de-DE', messages: de },
  { code: 'en', name: 'English', locale: 'en-GB', messages: en },
  { code: 'es', name: 'Español', locale: 'es-ES', messages: es }
];

const FALLBACK = LANGUAGES[0];
let current = FALLBACK;

const byCode = (code) => LANGUAGES.find(l => l.code === code);

export const language = () => current.code;
export const locale = () => current.locale;

export function setLanguage(code) {
  current = byCode(code) || FALLBACK;
  if (typeof document !== 'undefined') document.documentElement.lang = current.code;
}

// The first language of the browser that the app has, otherwise German.
export function browserLanguage() {
  const wanted = (typeof navigator !== 'undefined' && (navigator.languages || [navigator.language])) || [];
  for (const tag of wanted) {
    const match = tag && byCode(String(tag).slice(0, 2).toLowerCase());
    if (match) return match.code;
  }
  return FALLBACK.code;
}

const lookup = (messages, key) => key.split('.').reduce((node, part) => (node && typeof node === 'object' ? node[part] : undefined), messages);

const fill = (text, params) => text.replace(/\{(\w+)\}/g, (all, name) => (params[name] !== undefined && params[name] !== null ? String(params[name]) : all));

export function hasMessage(key) {
  return lookup(current.messages, key) !== undefined || lookup(FALLBACK.messages, key) !== undefined;
}

export function t(key, params = {}) {
  let message = lookup(current.messages, key);
  let lang = current;
  if (message === undefined) {
    message = lookup(FALLBACK.messages, key);
    lang = FALLBACK;
  }
  if (message === undefined) return key;
  if (typeof message === 'object') {
    if (!('other' in message)) return key; // a group of messages, not one
    const form = new Intl.PluralRules(lang.locale).select(Number(params.count) || 0);
    message = message[form] !== undefined ? message[form] : message.other;
  }
  return fill(String(message), params);
}
