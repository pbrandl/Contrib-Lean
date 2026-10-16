import { parseAmount } from './lib';

// Typing a bid or hours on the sheet. The keypad (touch devices) and the text field
// (computers) follow the same rules. "raw" is what the member typed so far: decimal
// comma, no thousands separators, for example "", "1585", "10,8" or "0,".

export const MAX_HOURS = 744; // MAX_HOURS in backend/server.js

export const KINDS = {
  money: { title: 'Dein Beitrag', unit: '€', maxInt: 6, maxDec: 2, label: 'Dein Beitrag in Euro' },
  hours: { title: 'Dein Stundenbeitrag', unit: 'h', maxInt: 3, maxDec: 1, label: 'Deine Stunden pro Monat' }
};

// An empty field counts as 0, like the dimmed "0" it shows.
export const rawValue = (raw) => (raw === '' ? 0 : Number(raw.replace(',', '.')));

function addKey(raw, key, kind) {
  const k = KINDS[kind];
  if (key === 'back') return raw.slice(0, -1);
  if (key === ',') return raw.includes(',') ? raw : `${raw || '0'},`;
  const [int, dec] = raw.split(',');
  if (raw.includes(',')) return dec.length >= k.maxDec ? raw : raw + key;
  if (int === '0') return key;
  return int.length >= k.maxInt ? raw : raw + key;
}

// One key: a digit, "," or "back". Hours above the maximum cannot be typed at all.
export function pressKey(raw, key, kind) {
  const next = addKey(raw, key, kind);
  return kind === 'hours' && rawValue(next) > MAX_HOURS ? raw : next;
}

// Any text (typed, pasted, dictated) in the same form the keypad produces.
export function sanitize(text, kind) {
  const k = KINDS[kind];
  let s = String(text).replace(/\./g, ',').replace(/[^\d,]/g, '');
  const comma = s.indexOf(',');
  if (comma !== -1) s = s.slice(0, comma + 1) + s.slice(comma + 1).replace(/,/g, '');
  let [int, dec] = s.split(',');
  int = int.replace(/^0+(?=\d)/, '').slice(0, k.maxInt);
  if (dec === undefined) return int;
  return `${int || '0'},${dec.slice(0, k.maxDec)}`;
}

// A number in the editor's own form: 1585 -> "1585", 10.8 -> "10,80", 11.5 h -> "11,5", 0 -> "".
export function toRaw(value, kind) {
  if (!value) return '';
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(KINDS[kind].maxDec).replace('.', ',');
}

// Pasted text: "1.234,56 €" and "12.50" are read as amounts, anything else keeps its digits.
export function fromText(text, kind) {
  const amount = parseAmount(String(text).replace(/h|std\.?|stunden/gi, ''));
  const next = Number.isFinite(amount) ? sanitize(toRaw(amount, kind), kind) : sanitize(text, kind);
  return kind === 'hours' && rawValue(next) > MAX_HOURS ? null : next;
}

const group = (int) => int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

// "1585,5" -> "1.585,5" while typing.
export function formatRaw(raw) {
  const [int, dec] = raw.split(',');
  return raw.includes(',') ? `${group(int || '0')},${dec}` : group(int);
}
