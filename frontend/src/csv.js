import { parseAmount } from './lib';

// Minimal RFC 4180 parser. Detects "," or ";" (German Excel) as delimiter
// and remembers the line each row starts on, for error messages.
export function parseCsv(text) {
  const src = text.replace(/^\uFEFF/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] || '';
  const count = (ch) => firstLine.split(ch).length - 1;
  const delimiter = count(';') > count(',') ? ';' : ',';

  const rows = [];
  let cells = [];
  let field = '';
  let quoted = false;
  let line = 1;
  let rowLine = 1;

  const endRow = () => {
    cells.push(field);
    if (cells.some(c => c.trim() !== '')) rows.push({ line: rowLine, cells });
    cells = [];
    field = '';
  };

  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (c === '"') {
        quoted = false;
      } else {
        if (c === '\n') line += 1;
        field += c;
      }
    } else if (c === '"' && field.trim() === '') {
      quoted = true;
      field = '';
    } else if (c === delimiter) {
      cells.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i += 1;
      endRow();
      line += 1;
      rowLine = line;
    } else {
      field += c;
    }
  }
  if (field !== '' || cells.length) endRow();
  return rows;
}

const NAME_HEADERS = ['username', 'name', 'mitglied'];
const PIN_HEADERS = ['pin'];
const AMOUNT_HEADERS = ['contribution', 'gebot', 'betrag'];
const HOURS_HEADERS = ['hours', 'stunden'];

// Spreadsheet apps run cells starting with = + - @ as formulas; a leading ' prevents that.
const FORMULA_START = /^[=+\-@]/;
const unguard = (name) => name.replace(/^'(?=[=+\-@])/, '');
const guard = (name) => (FORMULA_START.test(name) ? `'${name}` : name);

// Format: username,pin,contribution[,hours] (header optional). An empty PIN keeps
// the member's current PIN; new members get the default PIN.
export function membersFromCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) throw new Error('Die Datei ist leer.');

  const head = rows[0].cells.map(c => c.trim().toLowerCase());
  let columns = { name: 0, pin: 1, contribution: 2, hours: 3 };
  let body = rows;
  if (head.some(h => NAME_HEADERS.includes(h))) {
    const find = (names) => head.findIndex(h => names.includes(h));
    columns = { name: find(NAME_HEADERS), pin: find(PIN_HEADERS), contribution: find(AMOUNT_HEADERS), hours: find(HOURS_HEADERS) };
    body = rows.slice(1);
  }

  const users = body.map(({ line, cells }) => {
    const cell = (i) => (i >= 0 && i < cells.length ? cells[i].trim() : '');
    const name = unguard(cell(columns.name));
    if (!name) throw new Error(`Zeile ${line}: Der Name fehlt.`);
    const pin = cell(columns.pin);
    if (pin && !/^\d{4,6}$/.test(pin)) {
      throw new Error(`Zeile ${line}: Die PIN „${pin}“ muss aus 4 bis 6 Ziffern bestehen.`);
    }
    const raw = cell(columns.contribution);
    const contribution = raw === '' ? 0 : parseAmount(raw);
    if (!Number.isFinite(contribution)) {
      throw new Error(`Zeile ${line}: Der Betrag „${raw}“ ist keine gültige Zahl.`);
    }
    const rawHours = cell(columns.hours);
    const hours = rawHours === '' ? 0 : parseAmount(rawHours);
    if (!Number.isFinite(hours)) {
      throw new Error(`Zeile ${line}: Die Stunden „${rawHours}“ sind keine gültige Zahl.`);
    }
    return { line, name, pin: pin || undefined, contribution, hours };
  });

  if (!users.length) throw new Error('Die Datei enthält keine Mitglieder.');
  return users;
}

const quote = (value) => {
  const s = String(value);
  return /[",;\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// PINs are stored as hashes and cannot be exported; the column stays for compatibility.
// The BOM makes Excel read the file as UTF-8 (umlauts).
export function membersToCsv(users, contributions, hours = {}) {
  const rows = [
    ['username', 'pin', 'contribution', 'hours'],
    ...users.map(u => [guard(u.name), '', String(contributions[u.id] || 0), String(hours[u.id] || 0)])
  ];
  return `\uFEFF${rows.map(r => r.map(quote).join(',')).join('\r\n')}\r\n`;
}
