import { LANGUAGES, setLanguage, t } from './i18n';
import { errorMessage, formatEuro, formatNumber, parseAmount } from './lib';
import { formatRaw, fromField } from './entry';

afterEach(() => setLanguage('de'));

const keys = (node, prefix = '') => Object.entries(node).flatMap(([key, value]) => (
  value && typeof value === 'object' && !('other' in value) ? keys(value, `${prefix}${key}.`) : [`${prefix}${key}`]
));
const placeholders = (text) => (String(text).match(/\{\w+\}/g) || []).sort();

test('every language has exactly the keys and placeholders of German', () => {
  const de = LANGUAGES[0].messages;
  const flat = (messages, key) => key.split('.').reduce((n, k) => n[k], messages);
  for (const { code, messages } of LANGUAGES.slice(1)) {
    expect([code, keys(messages).sort()]).toEqual([code, keys(de).sort()]);
    for (const key of keys(de)) {
      const want = flat(de, key);
      const have = flat(messages, key);
      const forms = (m) => (typeof m === 'object' ? m.other : m);
      expect([code, key, placeholders(forms(have))]).toEqual([code, key, placeholders(forms(want))]);
    }
  }
});

test('plurals, placeholders and the German fallback', () => {
  expect(t('count.members', { count: 1 })).toBe('1 Mitglied');
  expect(t('count.members', { count: 3 })).toBe('3 Mitglieder');
  setLanguage('en');
  expect(t('count.members', { count: 1 })).toBe('1 member');
  expect(t('front.noMatch', { query: 'xy' })).toBe('No name matches “xy”.');
  expect(t('does.not.exist')).toBe('does.not.exist');
});

test('numbers follow the language, amounts can be typed in its style', () => {
  expect(formatEuro(1585.5)).toBe('1.585,50 €');
  setLanguage('en');
  expect(formatEuro(1585.5)).toBe('1,585.50 €');
  expect(parseAmount('1,585.50')).toBe(1585.5);
  expect(formatRaw('1585,5')).toBe('1,585.5');
  expect(fromField('1,585.5', 'money')).toBe('1585,5');
  setLanguage('es');
  expect(formatNumber(1585)).toBe('1.585');
  expect(fromField('1.585,5', 'money')).toBe('1585,5');
});

test('server errors are shown in the page\'s language, with the German text as fallback', () => {
  const wrong = { error: 'PIN falsch. Noch 4 Versuche …', code: 'wrong_pin', params: { left: 4 } };
  expect(errorMessage(wrong, 401)).toBe('PIN falsch. Noch 4 Versuche, dann wird die Anmeldung kurz gesperrt.');
  setLanguage('es');
  expect(errorMessage(wrong, 401)).toBe('PIN incorrecto. Te quedan 4 intentos; después el acceso se bloquea un rato.');
  setLanguage('en');
  expect(errorMessage({ code: 'hours_range', params: { where: { line: 3 }, max: 744 } }, 400)).toBe('Row 3: The hours must be between 0 and 744.');
  expect(errorMessage({ code: 'amount_range', params: { field: 'target', max: 1000000 } }, 400)).toBe('The target must be a number between 0 and 1,000,000.');
  expect(errorMessage({ code: 'account_locked', params: { wait: 30 * 60000, admin: true } }, 429)).toMatch(/^There were too many failed attempts for the admin account\. .* in 30 minutes\./);
  expect(errorMessage({ code: 'import_duplicate', params: { name: 'A', first: { entry: 1 }, second: { entry: 2 } } }, 400)).toBe('“A” appears twice in the file (Entry 1 and Entry 2).');
  expect(errorMessage({ error: 'Neu im Server', code: 'some_new_code' }, 400)).toBe('Neu im Server');
});
