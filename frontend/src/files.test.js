import { readImportFile } from './files';
import { readXlsx, writeXlsx } from './xlsx';

const file = (content) => new Blob([content], { type: 'application/octet-stream' });

test('XLSX: written with numbers and text, read back the same', () => {
  const bytes = writeXlsx([
    ['username', 'pin', 'contribution', 'contribution_gross', 'entered_as', 'hours'],
    ['Müller, Eva & <Co>', '', 12.5, 14.88, 'netto', 0],
    ['=Bob', '', 0, 0, '', 4.5]
  ], { sheetName: 'Bietrunde', widths: [30] });
  expect(bytes[0]).toBe(0x50); // a zip file
  const rows = readXlsx(bytes);
  expect(rows).toEqual([
    { line: 1, cells: ['username', 'pin', 'contribution', 'contribution_gross', 'entered_as', 'hours'] },
    { line: 2, cells: ['Müller, Eva & <Co>', '', '12.5', '14.88', 'netto', '0'] },
    { line: 3, cells: ['=Bob', '', '0', '0', '', '4.5'] }
  ]);
});

test('the import recognises XLSX, CSV (also from German Excel) and JSON by their content', async () => {
  const xlsx = writeXlsx([['username', 'pin', 'contribution'], ['Anna', '1234', 50], ['Ben', '', 25.5]]);
  const fromXlsx = await readImportFile(file(xlsx));
  expect([fromXlsx.kind, fromXlsx.count, fromXlsx.total]).toEqual(['xlsx', 2, 75.5]);
  expect(fromXlsx.body.users[0]).toMatchObject({ line: 2, name: 'Anna', pin: '1234', contribution: 50 });

  // Windows-1252 as German Excel saves CSV: "ü" is one byte (0xFC).
  const cp1252 = new Uint8Array([...'username;contribution\nM'].map(c => c.charCodeAt(0)).concat([0xfc], [...'ller;10,5'].map(c => c.charCodeAt(0))));
  const fromCsv = await readImportFile(file(cp1252));
  expect([fromCsv.kind, fromCsv.body.users[0].name, fromCsv.total]).toEqual(['csv', 'Müller', 10.5]);

  const fromJson = await readImportFile(file(JSON.stringify({ users: [{ id: '1', name: 'Anna' }], contributions: { 1: 20 }, targetAmount: 900 })));
  expect([fromJson.kind, fromJson.total, fromJson.target]).toEqual(['json', 20, 900]);

  await expect(readImportFile(file(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0])))).rejects.toThrow('alte Excel-Datei');
  await expect(readImportFile(file(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3])))).rejects.toThrow('Excel-Datei lässt sich nicht lesen');
  await expect(readImportFile(file(''))).rejects.toThrow('Die Datei ist leer.');
  await expect(readImportFile(file('username,pin\n,1234'))).rejects.toThrow('Zeile 2: Der Name fehlt.');
});
