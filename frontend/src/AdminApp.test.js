import { fireEvent, render, screen } from '@testing-library/react';
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
  global.fetch = jest.fn((url, options) => {
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
