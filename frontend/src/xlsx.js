import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

// Just enough of the Excel format (XLSX, a zip of XML files) for the member list: one
// sheet with text and numbers, written with a bold header row, and read back from what
// Excel, LibreOffice and Numbers save. Loaded only when somebody exports or imports XLSX.

const escape = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  // characters XML does not allow at all
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

const column = (i) => {
  let name = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
};

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';

// `rows`: arrays of strings and numbers; the first row is the header. `widths`: per column.
export function writeXlsx(rows, { sheetName = 'Sheet1', widths = [] } = {}) {
  const cells = rows.map((row, r) => `<row r="${r + 1}">${row.map((value, c) => {
    const ref = `${column(c)}${r + 1}`;
    const style = r === 0 ? ' s="1"' : '';
    if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}"${style}><v>${value}</v></c>`;
    if (value === '' || value === null || value === undefined) return '';
    return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${escape(value)}</t></is></c>`;
  }).join('')}</row>`).join('');
  const cols = widths.length ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';

  const files = {
    '[Content_Types].xml': `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
      + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
      + '</Types>',
    '_rels/.rels': `${XML}<Relationships xmlns="${PKG_REL}">`
      + `<Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `${XML}<workbook xmlns="${MAIN}" xmlns:r="${REL}">`
      + `<sheets><sheet name="${escape(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `${XML}<Relationships xmlns="${PKG_REL}">`
      + `<Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/>`
      + `<Relationship Id="rId2" Type="${REL}/styles" Target="styles.xml"/></Relationships>`,
    'xl/styles.xml': `${XML}<styleSheet xmlns="${MAIN}">`
      + '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
      + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
      + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
      + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
      + '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>'
      + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
      + '</styleSheet>',
    'xl/worksheets/sheet1.xml': `${XML}<worksheet xmlns="${MAIN}">`
      + '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
      + `${cols}<sheetData>${cells}</sheetData></worksheet>`
  };
  return zipSync(Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)])));
}

export class XlsxError extends Error {}

const parse = (text) => new DOMParser().parseFromString(text, 'application/xml');
// Elements by local name, whatever prefix the program used ("x:c" or "c").
const all = (node, name) => Array.from(node.getElementsByTagNameNS('*', name));
const textOf = (node) => all(node, 't').map(t => t.textContent).join('');

// The first sheet as rows of strings, each with its row number in Excel: [{ line, cells }].
export function readXlsx(bytes) {
  let files;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new XlsxError('broken');
  }
  const read = (name) => (files[name] ? strFromU8(files[name]) : null);
  const workbook = read('xl/workbook.xml');
  if (!workbook) throw new XlsxError('broken');

  // The first sheet of the workbook, through its relationship (the file name varies).
  let sheetPath = 'xl/worksheets/sheet1.xml';
  const first = all(parse(workbook), 'sheet')[0];
  const rels = read('xl/_rels/workbook.xml.rels');
  if (first && rels) {
    const id = first.getAttributeNS(REL, 'id') || first.getAttribute('r:id');
    const rel = all(parse(rels), 'Relationship').find(r => r.getAttribute('Id') === id);
    if (rel) {
      const target = rel.getAttribute('Target');
      sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
    }
  }
  const sheet = read(sheetPath);
  if (!sheet) throw new XlsxError('broken');

  const shared = read('xl/sharedStrings.xml');
  const strings = shared ? all(parse(shared), 'si').map(textOf) : [];

  const rows = [];
  all(parse(sheet), 'row').forEach((row, index) => {
    const line = Number(row.getAttribute('r')) || index + 1;
    const cells = [];
    for (const cell of all(row, 'c')) {
      const ref = cell.getAttribute('r');
      let col = cells.length;
      if (ref) {
        const letters = ref.replace(/\d+$/, '');
        col = letters.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
      }
      const type = cell.getAttribute('t');
      const v = all(cell, 'v')[0];
      let value = '';
      if (type === 's') value = v ? strings[Number(v.textContent)] || '' : '';
      else if (type === 'inlineStr') value = textOf(cell);
      else if (v) value = v.textContent;
      while (cells.length < col) cells.push('');
      cells[col] = String(value);
    }
    if (cells.some(c => c.trim() !== '')) rows.push({ line, cells });
  });
  return rows;
}
