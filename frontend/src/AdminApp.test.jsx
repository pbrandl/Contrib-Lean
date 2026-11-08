import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { render } from './test-utils';
import AdminApp from './AdminApp';

const respond = (body) => Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, json: () => Promise.resolve(body) });
const state = (users) => ({
  rev: users.length, boot: 'x', totalRaised: 0, targetAmount: 6500, contributorCount: 0, totalHours: 0,
  admin: { defaultPin: false }, users
});

beforeEach(() => {
  window.sessionStorage.clear();
  window.sessionStorage.setItem('franzwerk.admin', JSON.stringify({ token: 't', role: 'admin', user: { id: 'admin' } }));
});

test('adding a member shows the random start PIN until the admin closes it', async () => {
  globalThis.fetch = vi.fn((url, options) => {
    if (url === '/api/admin/users' && options.method === 'POST') {
      return respond({ ...state([{ id: '1', name: 'Anna', defaultPin: true }]), added: { id: '1', name: 'Anna', defaultPin: true, startPin: '4821' } });
    }
    return respond(state([]));
  });
  render(<AdminApp />);
  fireEvent.change(await screen.findByLabelText('Mitglied eintragen'), { target: { value: 'Anna' } });
  fireEvent.click(screen.getByRole('button', { name: 'Eintragen' }));
  expect(await screen.findByTestId('start-pin')).toHaveTextContent('4821');
  expect(screen.getByText(/Anna ist eingetragen/)).toBeInTheDocument();
  expect(screen.queryByText(/1234/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Fertig' }));
  expect(screen.queryByTestId('start-pin')).not.toBeInTheDocument();
});

test('the member list is folded away, and the netto/brutto setting changes only the display', async () => {
  globalThis.fetch = vi.fn(() => respond({ ...state([{ id: '1', name: 'Anna', defaultPin: true }, { id: '2', name: 'Ben', defaultPin: false }]), totalRaised: 1000 }));
  render(<AdminApp />);
  const head = await screen.findByRole('button', { name: /Mitglieder/ });
  expect(head).toHaveTextContent('2 Mitglieder, 1 davon mit Start-PIN');
  expect(head).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByText('Anna')).not.toBeInTheDocument();
  fireEvent.click(head);
  expect(screen.getByText('Anna')).toBeInTheDocument();
  expect(screen.getByLabelText('Mitglied eintragen')).toBeInTheDocument();

  expect(screen.getByText('von 6.500 €')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Einstellungen' }));
  fireEvent.click(screen.getByRole('radio', { name: 'Brutto' }));
  fireEvent.click(screen.getByRole('button', { name: 'Einstellungen schließen' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.getByText('von 7.735 €')).toBeInTheDocument();
  expect(screen.getByText('1.190')).toBeInTheDocument();
  expect(screen.getByText('Aktuell 6.500 € netto')).toBeInTheDocument();
  expect(screen.getByLabelText('Neuer Bedarf in Euro (netto)')).toBeInTheDocument();
});

test('a tap on a member opens name and PIN; both are saved in one request', async () => {
  const users = [{ id: '1', name: 'Anna', defaultPin: true }, { id: '2', name: 'Ben', defaultPin: false }];
  globalThis.fetch = vi.fn((url, options = {}) => {
    if (options.method === 'PATCH') {
      const body = JSON.parse(options.body);
      return respond(state(users.map(u => (u.id === '1' ? { ...u, name: body.name || u.name, defaultPin: false } : u))));
    }
    return respond(state(users));
  });
  render(<AdminApp />);
  fireEvent.click(await screen.findByRole('button', { name: /Mitglieder/ }));
  fireEvent.click(screen.getByRole('button', { name: /Anna/ }));
  const name = screen.getByLabelText('Name');
  expect(name).toHaveValue('Anna');
  fireEvent.change(name, { target: { value: 'Anna Becker' } });
  fireEvent.change(screen.getByLabelText(/Neue PIN/), { target: { value: '12' } });
  const editor = within(name.closest('form'));
  fireEvent.click(editor.getByRole('button', { name: 'Speichern' }));
  expect(editor.getByRole('alert')).toHaveTextContent('4 bis 8 Ziffern');
  fireEvent.change(screen.getByLabelText(/Neue PIN/), { target: { value: '24681357' } });
  fireEvent.click(editor.getByRole('button', { name: 'Speichern' }));
  expect(await screen.findByText('Name und PIN von Anna Becker sind gespeichert.')).toBeInTheDocument();
  const patch = globalThis.fetch.mock.calls.find(([, o]) => o && o.method === 'PATCH');
  expect(patch[0]).toBe('/api/admin/users/1');
  expect(JSON.parse(patch[1].body)).toEqual({ name: 'Anna Becker', pin: '24681357' });
  expect(screen.getByText('Anna Becker')).toBeInTheDocument();
  expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();

  // Deleting sits in the editor, behind a question.
  fireEvent.click(screen.getByRole('button', { name: /Ben/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Mitglied löschen' }));
  expect(screen.getByText(/Ben löschen\?/)).toBeInTheDocument();
});

test('export: Download on the left, the format on the right, remembered for next time', async () => {
  const exported = { users: [{ id: '1', name: 'Anna' }], contributions: { 1: 100 }, hours: {}, contributionsGross: {}, enteredAs: {} };
  globalThis.fetch = vi.fn((url) => respond(url === '/api/admin/export' ? exported : state([{ id: '1', name: 'Anna', defaultPin: false }])));
  const files = [];
  URL.createObjectURL = vi.fn((blob) => { files.push(blob); return 'blob:x'; });
  URL.revokeObjectURL = vi.fn();
  const clicked = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() { files.push(this.download); });
  render(<AdminApp />);
  const format = await screen.findByLabelText('Format');
  expect(format).toHaveValue('xlsx');
  fireEvent.change(format, { target: { value: 'csv' } });
  fireEvent.click(screen.getByRole('button', { name: /Herunterladen/ }));
  await screen.findByRole('button', { name: /Herunterladen/ });
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(files[0].type).toBe('text/csv;charset=utf-8');
  expect(files[1]).toMatch(/^bietrunde-\d{4}-\d{2}-\d{2}\.csv$/);
  expect(window.localStorage.getItem('franzwerk.exportFormat')).toBe('csv');
  expect(screen.getByText(/Erlaubt: CSV, Excel \(XLSX\) oder JSON/)).toBeInTheDocument();
  clicked.mockRestore();
});

test('the browser\'s back button leaves the admin page to the admin PIN screen', async () => {
  globalThis.fetch = vi.fn(() => respond(state([])));
  render(<AdminApp />);
  expect(await screen.findByRole('button', { name: /Mitglieder/ })).toBeInTheDocument();
  expect(window.history.state).toEqual({ admin: true });
  window.history.back();
  expect(await screen.findByRole('heading', { name: 'Admin' })).toBeInTheDocument();
  expect(screen.getByText('Melde dich mit der Admin-PIN an.')).toBeInTheDocument();
  expect(window.sessionStorage.getItem('franzwerk.admin')).toBeNull();
});
