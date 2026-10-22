import { t } from './i18n';
import { parseAmount, toGross } from './lib';

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
const GROSS_HEADERS = ['contribution_gross', 'brutto'];
const ENTERED_HEADERS = ['entered_as', 'eingegeben'];

// Spreadsheet apps run cells starting with = + - @ as formulas; a leading ' prevents that.
const FORMULA_START = /^[=+\-@]/;
const unguard = (name) => name.replace(/^'(?=[=+\-@])/, '');
const guard = (name) => (FORMULA_START.test(name) ? `'${name}` : name);

// Format: username,pin,contribution[,hours] (header optional). An empty PIN keeps
// the member's current PIN; new members get the default PIN.
export const membersFromCsv = (text) => membersFromRows(parseCsv(text));

// The same for rows from any table (CSV or the first sheet of an XLSX): [{ line, cells }].
export function membersFromRows(rows) {
  if (!rows.length) throw new Error(t('import.empty'));

  const head = rows[0].cells.map(c => c.trim().toLowerCase());
  let columns = { name: 0, pin: 1, contribution: 2, hours: 3 };
  let body = rows;
  if (head.some(h => NAME_HEADERS.includes(h))) {
    const find = (names) => head.findIndex(h => names.includes(h));
    columns = {
      name: find(NAME_HEADERS),
      pin: find(PIN_HEADERS),
      contribution: find(AMOUNT_HEADERS),
      gross: find(GROSS_HEADERS),
      entered: find(ENTERED_HEADERS),
      hours: find(HOURS_HEADERS)
    };
    body = rows.slice(1);
  }

  const users = body.map(({ line, cells }) => {
    const cell = (i) => (i >= 0 && i < cells.length ? cells[i].trim() : '');
    const name = unguard(cell(columns.name));
    const at = t('where.line', { n: line });
    if (!name) throw new Error(t('import.noName', { at }));
    const pin = cell(columns.pin);
    if (pin && !/^\d{4,8}$/.test(pin)) {
      throw new Error(t('import.badPin', { at, pin }));
    }
    const raw = cell(columns.contribution);
    const contribution = raw === '' ? 0 : parseAmount(raw);
    if (!Number.isFinite(contribution)) {
      throw new Error(t('import.badAmount', { at, value: raw }));
    }
    const rawHours = cell(columns.hours);
    const hours = rawHours === '' ? 0 : parseAmount(rawHours);
    if (!Number.isFinite(hours)) {
      throw new Error(t('import.badHours', { at, value: rawHours }));
    }
    // A bid typed brutto (entered_as "brutto", from an export) keeps its brutto amount.
    const brutto = columns.entered !== undefined && cell(columns.entered).toLowerCase() === 'brutto';
    const rawGross = brutto ? cell(columns.gross) : '';
    const gross = rawGross === '' ? NaN : parseAmount(rawGross);
    if (brutto && rawGross !== '' && !Number.isFinite(gross)) {
      throw new Error(t('import.badGross', { at, value: rawGross }));
    }
    const user = { line, name, pin: pin || undefined, contribution, hours };
    if (brutto && Number.isFinite(gross)) Object.assign(user, { contributionGross: gross, enteredAs: 'brutto' });
    return user;
  });

  if (!users.length) throw new Error(t('import.noMembers'));
  return users;
}

const quote = (value) => {
  const s = String(value);
  return /[",;\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// PINs are stored as hashes and cannot be exported; the column stays for compatibility.
// `contribution` is netto. `entered_as` says how the member typed the bid: for "brutto",
// `contribution_gross` is that typed amount and the import keeps it; otherwise it is only
// netto x 1.19 for reading. The BOM makes Excel read the file as UTF-8 (umlauts).
// The export as a table, for CSV and XLSX alike (the same columns, so both import again).
// `data`: the answer of GET /api/admin/export.
export function memberRows({ users, contributions = {}, hours = {}, contributionsGross: gross = {}, enteredAs = {} }) {
  return [
    ['username', 'pin', 'contribution', 'contribution_gross', 'entered_as', 'hours'],
    ...users.map(u => {
      const net = contributions[u.id] || 0;
      const brutto = net > 0 && enteredAs[u.id] === 'brutto' && gross[u.id] > 0;
      return [u.name, '', net, brutto ? gross[u.id] : toGross(net), net > 0 ? (brutto ? 'brutto' : 'netto') : '', hours[u.id] || 0];
    })
  ];
}

export function membersToCsv(data) {
  const rows = memberRows(data).map((row, i) => (i === 0 ? row : [guard(row[0]), ...row.slice(1)]));
  return `\uFEFF${rows.map(r => r.map(quote).join(',')).join('\r\n')}\r\n`;
}
