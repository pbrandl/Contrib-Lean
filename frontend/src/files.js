import { membersFromCsv, membersFromRows, membersToCsv, memberRows } from './csv';
import { t } from './i18n';
import { round2 } from './lib';

// Export and import files. A new format: one entry in EXPORT_FORMATS and one case in
// readImportFile; the admin page lists the formats from here.

// The XLSX code is loaded only when needed; the demo is one single file, so it is built in there.
const loadXlsx = () => (process.env.REACT_APP_DEMO === '1' ? Promise.resolve(require('./xlsx')) : import('./xlsx'));

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export const EXPORT_FORMATS = [
  {
    id: 'xlsx',
    label: 'Excel (XLSX)',
    async build(data) {
      const { writeXlsx } = await loadXlsx();
      return { type: XLSX_TYPE, content: writeXlsx(memberRows(data), { sheetName: 'Bietrunde', widths: [30, 8, 14, 18, 12, 10] }) };
    }
  },
  { id: 'csv', label: 'CSV', build: async (data) => ({ type: 'text/csv;charset=utf-8', content: membersToCsv(data) }) },
  { id: 'json', label: 'JSON', build: async (data) => ({ type: 'application/json', content: JSON.stringify(data, null, 2) }) }
];

// What the file picker offers; readImportFile looks at the content, not at the name.
export const IMPORT_ACCEPT = `.csv,.xlsx,.json,text/csv,application/json,${XLSX_TYPE}`;

// A whole table (CSV or XLSX): the members with their bids, hours and PINs.
function fromRows(users) {
  return {
    body: { users },
    count: users.length,
    total: round2(users.reduce((sum, u) => sum + u.contribution, 0)),
    target: null
  };
}

// The JSON export of this app, with the Bedarf.
function fromJson(text) {
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(t('import.badJson'));
  }
  if (!json || !Array.isArray(json.users)) throw new Error(t('import.noList'));
  const users = json.users.filter(u => u && u.id !== 'admin');
  const contributions = json.contributions && typeof json.contributions === 'object' ? json.contributions : {};
  const hours = json.hours && typeof json.hours === 'object' ? json.hours : {};
  // Bids typed brutto keep their brutto amount (from the export of this app).
  const contributionsGross = json.contributionsGross && typeof json.contributionsGross === 'object' ? json.contributionsGross : undefined;
  const enteredAs = json.enteredAs && typeof json.enteredAs === 'object' ? json.enteredAs : undefined;
  const target = Number(json.targetAmount) > 0 ? Number(json.targetAmount) : null;
  return {
    body: { users, contributions, contributionsGross, enteredAs, hours, targetAmount: target || undefined },
    count: users.length,
    total: round2(users.reduce((sum, u) => sum + (Number(contributions[u.id]) || 0), 0)),
    target
  };
}

function readBytes(file) {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

const startsWith = (bytes, signature) => signature.every((b, i) => bytes[i] === b);

// Text from a file: UTF-8, or Windows-1252 as German Excel saves "CSV (Trennzeichen-getrennt)".
function decode(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

// The kind of file from its first bytes: XLSX is a zip ("PK"), JSON starts with "{" or "[",
// everything else is read as CSV. Returns { kind, body, count, total, target }.
export async function readImportFile(file) {
  const bytes = new Uint8Array(await readBytes(file));
  if (!bytes.length) throw new Error(t('import.empty'));
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    const { readXlsx } = await loadXlsx();
    let rows;
    try {
      rows = readXlsx(bytes);
    } catch {
      throw new Error(t('import.badXlsx'));
    }
    return { kind: 'xlsx', ...fromRows(membersFromRows(rows)) };
  }
  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0])) throw new Error(t('import.oldExcel'));
  const text = decode(bytes);
  if (/^\s*[{[]/.test(text)) return { kind: 'json', ...fromJson(text) };
  if (text.includes('\u0000')) throw new Error(t('import.unknown'));
  return { kind: 'csv', ...fromRows(membersFromCsv(text)) };
}
