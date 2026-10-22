import { membersFromCsv, membersToCsv, parseCsv } from './csv';
import { parseAmount } from './lib';

test('reads the documented format with header', () => {
  const users = membersFromCsv('username,pin,contribution\nAnna,4321,25\nBen,,\n');
  expect(users).toEqual([
    { line: 2, name: 'Anna', pin: '4321', contribution: 25, hours: 0 },
    { line: 3, name: 'Ben', pin: undefined, contribution: 0, hours: 0 }
  ]);
});

test('reads German Excel files (semicolon, decimal comma, BOM)', () => {
  const users = membersFromCsv('\uFEFFusername;pin;contribution\r\n"Müller, Eva";1234;12,50\r\n');
  expect(users).toEqual([{ line: 2, name: 'Müller, Eva', pin: '1234', contribution: 12.5, hours: 0 }]);
});

test('reads files without header', () => {
  expect(membersFromCsv('Anna\nBen,5555,3').map(u => u.name)).toEqual(['Anna', 'Ben']);
});

test('reports the line of invalid values', () => {
  expect(() => membersFromCsv('username,pin,contribution\nAnna,12,5')).toThrow('Zeile 2');
  expect(() => membersFromCsv('username,pin,contribution\nAnna,1234,5\nBen,1234,viel')).toThrow('Zeile 3');
});

test('keeps quoted line breaks and quotes', () => {
  expect(parseCsv('"a ""b""\nc",d\ne,f')).toEqual([
    { line: 1, cells: ['a "b"\nc', 'd'] },
    { line: 3, cells: ['e', 'f'] }
  ]);
});

test('export round-trips names, bids and hours; a bid typed brutto keeps its brutto amount', () => {
  const users = [{ id: '1', name: 'Müller, Eva' }, { id: '2', name: '=Bob' }, { id: '3', name: 'Cem' }];
  const csv = membersToCsv({ users, contributions: { 1: 12.5, 3: 12.61 }, hours: { 2: 4.5 }, contributionsGross: { 1: 14.88, 3: 15 }, enteredAs: { 1: 'netto', 3: 'brutto' } });
  const lines = csv.split('\r\n');
  expect(lines[0]).toBe('\uFEFFusername,pin,contribution,contribution_gross,entered_as,hours');
  expect(lines[1]).toBe('"Müller, Eva",,12.5,14.88,netto,0');
  expect(lines[3]).toBe('Cem,,12.61,15,brutto,0');
  expect(membersFromCsv(csv)[2]).toEqual({ line: 4, name: 'Cem', pin: undefined, contribution: 12.61, hours: 0, contributionGross: 15, enteredAs: 'brutto' });
  expect(membersFromCsv(csv).slice(0, 2)).toEqual([
    { line: 2, name: 'Müller, Eva', pin: undefined, contribution: 12.5, hours: 0 },
    { line: 3, name: '=Bob', pin: undefined, contribution: 0, hours: 4.5 }
  ]);
});

test('reads hours column and rejects invalid hours', () => {
  expect(membersFromCsv('username;pin;contribution;stunden\nAnna;;5;2,5').map(u => u.hours)).toEqual([2.5]);
  expect(() => membersFromCsv('username,pin,contribution,hours\nAnna,,5,viel')).toThrow('Zeile 2');
});

test('parses amounts in German and English notation', () => {
  expect(parseAmount('6500')).toBe(6500);
  expect(parseAmount('6.500')).toBe(6500);
  expect(parseAmount('6.500,50 €')).toBe(6500.5);
  expect(parseAmount('12.50')).toBe(12.5);
  expect(parseAmount('abc')).toBeNaN();
  expect(parseAmount('-5')).toBeNaN();
});
