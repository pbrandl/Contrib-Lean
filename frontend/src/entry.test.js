import { formatRaw, fromText, pressKey, sanitize, toRaw } from './entry';
import { toGross, toNet } from './lib';

const keys = (list, kind, start = '') => list.reduce((raw, key) => pressKey(raw, key, kind), start);

test('keypad: at most 6 + 2 digits for euros and 3 + 1 for hours, one comma, no leading zeros', () => {
  expect(keys(['1', '2', '3', '4', '5', '6', '7'], 'money')).toBe('123456');
  expect(keys(['0', '0', '5'], 'money')).toBe('5');
  expect(keys([',', '5', ',', '0', '1'], 'money')).toBe('0,50');
  expect(keys(['1', '0', ',', '8', '7', '9'], 'money')).toBe('10,87');
  expect(keys(['1', '2', ',', '5', '5'], 'hours')).toBe('12,5');
  expect(keys(['7', '4', '4', ',', '1'], 'hours')).toBe('744,');
  expect(keys(['7', '5', '0'], 'hours')).toBe('75');
  expect(keys(['back', 'back', 'back'], 'money', '1585')).toBe('1');
  expect(keys(['back'], 'money', '')).toBe('');
});

test('typed and pasted text follows the same rules', () => {
  expect(sanitize('12.5', 'money')).toBe('12,5');
  expect(sanitize('abc0012,345', 'money')).toBe('12,34');
  expect(sanitize('1234567', 'money')).toBe('123456');
  expect(fromText('1.234,56 €', 'money')).toBe('1234,56');
  expect(fromText('12.50', 'money')).toBe('12,50');
  expect(fromText('6,5 h', 'hours')).toBe('6,5');
  expect(fromText('800', 'hours')).toBeNull();
});

test('display: thousands separator while typing, the current value in the editor form', () => {
  expect(formatRaw('1234567,8')).toBe('1.234.567,8');
  expect(formatRaw('0,')).toBe('0,');
  expect(formatRaw('')).toBe('');
  expect(toRaw(1585, 'money')).toBe('1585');
  expect(toRaw(10.8, 'money')).toBe('10,80');
  expect(toRaw(11.5, 'hours')).toBe('11,5');
  expect(toRaw(0, 'money')).toBe('');
});

test('brutto is netto × 1,19 in whole cents; brutto input is turned into netto rounded up', () => {
  expect(toGross(1585)).toBe(1886.15);
  expect(toGross(12.5)).toBe(14.88);
  expect(toGross(10.87)).toBe(12.94);
  expect(toNet(1886.15)).toBe(1585);
  expect(toNet(12.94)).toBe(10.88);
  expect(toNet(100)).toBe(84.04);
  expect(toNet(0)).toBe(0);
});
