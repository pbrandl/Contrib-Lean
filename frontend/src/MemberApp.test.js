import { act, fireEvent, render, screen } from '@testing-library/react';
import MemberApp from './MemberApp';

const respond = (body) => Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, json: () => Promise.resolve(body) });
// Anna bids 1585 € and 11,5 h; the others together 16835 € and 135,5 h.
const me = (contribution, rev, hours = 11.5) => ({
  rev, boot: 'x', totalRaised: 16835 + contribution, targetAmount: 24000, contributorCount: 12, totalHours: 135.5 + hours,
  user: { id: '7', name: 'Anna', defaultPin: false }, contribution, hours
});

// Fake server: GET /me answers the current state, PUT stores the value.
function server({ failFirst = false } = {}) {
  let state = me(1585, 1);
  let failed = !failFirst;
  global.fetch = jest.fn((url, options = {}) => {
    if (options.method === 'PUT') {
      if (!failed) {
        failed = true;
        return Promise.reject(new TypeError('Failed to fetch'));
      }
      const body = JSON.parse(options.body);
      if (url === '/api/me/contribution') state = me(body.amount, state.rev + 1, state.hours);
      if (url === '/api/me/hours') state = me(state.contribution, state.rev + 1, body.hours);
      return respond(state);
    }
    return respond(state);
  });
}

const puts = () => global.fetch.mock.calls.filter(([, o]) => o && o.method === 'PUT').map(([url, o]) => [url, JSON.parse(o.body)]);

const touch = (coarse) => {
  window.matchMedia = jest.fn(query => ({ matches: coarse && query === '(pointer: coarse)', media: query }));
};

const type = (input, keys) => keys.forEach(key => fireEvent.keyDown(input, { key }));

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem('franzwerk.member', JSON.stringify({ token: 't', role: 'member', user: { id: '7', name: 'Anna' } }));
  touch(false);
});

test('desktop: the text field starts with the bid, previews the total and saves the new amount netto', async () => {
  server();
  render(<MemberApp />);
  expect(await screen.findByTestId('own-amount')).toHaveTextContent('1.585');
  expect(screen.getByText('von 24.000 €')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Beitrag ändern' }));

  const input = screen.getByLabelText('Dein Beitrag in Euro');
  expect(input).toHaveValue('1.585');
  expect(input).toHaveFocus();
  const save = screen.getByRole('button', { name: /Speichern/ });
  expect(save).toBeDisabled();
  expect(screen.getByTestId('sheet-total')).toHaveTextContent('18.420 €');

  type(input, ['Backspace', 'Backspace', 'Backspace', 'Backspace', '1', '0', 'x', ',', '8', '7', '9', 'ArrowLeft']);
  expect(input).toHaveValue('10,87');
  expect(screen.getByTestId('sheet-total')).toHaveTextContent('16.846 €');
  expect(save).toBeEnabled();

  fireEvent.keyDown(input, { key: 'Enter' });
  expect(await screen.findByText('Dein Beitrag ist jetzt 10,87 €.')).toBeInTheDocument();
  expect(puts()).toEqual([['/api/me/contribution', { amount: 10.87 }]]);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByTestId('own-amount')).toHaveTextContent('10,87');
  expect(screen.getByRole('button', { name: 'Beitrag ändern' })).toHaveFocus();
});

test('brutto mode shows brutto everywhere, and a brutto input is sent netto, rounded up to the cent', async () => {
  server();
  render(<MemberApp />);
  fireEvent.click(await screen.findByRole('button', { name: /Beträge netto/ }));
  expect(screen.getByRole('button', { name: /Beträge brutto/ })).toHaveTextContent('Brutto');
  expect(JSON.parse(window.localStorage.getItem('franzwerk.mode'))).toBe('brutto');
  expect(screen.getByTestId('own-amount')).toHaveTextContent('1.886,15');
  expect(screen.getByText('von 28.560 €')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Beitrag ändern' }));
  const input = screen.getByLabelText('Dein Beitrag in Euro');
  expect(input).toHaveValue('1.886,15');
  fireEvent.paste(input, { clipboardData: { getData: () => '12,94 €' } });
  expect(input).toHaveValue('12,94');
  fireEvent.click(screen.getByRole('button', { name: /Speichern/ }));
  expect(await screen.findByText('Dein Beitrag ist jetzt 12,95 €.')).toBeInTheDocument();
  expect(puts()).toEqual([['/api/me/contribution', { amount: 10.88 }]]);
});

test('keypad: digits, comma and backspace; hours above 744 cannot be typed; 0 withdraws the bid', async () => {
  touch(true);
  server();
  render(<MemberApp />);
  fireEvent.click(await screen.findByRole('button', { name: 'Stunden ändern' }));
  expect(screen.getByRole('heading', { name: 'Dein Stundenbeitrag' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Schließen, ohne zu speichern' })).toHaveFocus();
  const amount = screen.getByTestId('sheet-amount');
  expect(amount).toHaveTextContent('11,5h');
  const key = (k) => fireEvent.click(screen.getByRole('button', { name: k }));
  ['Letzte Ziffer löschen', 'Letzte Ziffer löschen', 'Letzte Ziffer löschen', 'Letzte Ziffer löschen'].forEach(key);
  expect(amount).toHaveTextContent('0h');
  ['7', '5'].forEach(key);
  key('0'); // 750 h is more than 744: ignored
  expect(amount).toHaveTextContent('75h');
  expect(screen.getByTestId('sheet-total')).toHaveTextContent('210,5 h');
  fireEvent.keyDown(document, { key: ',' });
  fireEvent.keyDown(document, { key: '5' });
  fireEvent.keyDown(document, { key: '5' }); // only one decimal for hours
  expect(amount).toHaveTextContent('75,5h');
  expect(screen.getByRole('button', { name: 'Komma' })).toBeDisabled();
  fireEvent.keyDown(document, { key: 'Enter' });
  expect(await screen.findByText('Dein Stundenbeitrag ist jetzt 75,5 h.')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Beitrag ändern' }));
  ['Letzte Ziffer löschen', 'Letzte Ziffer löschen', 'Letzte Ziffer löschen', 'Letzte Ziffer löschen'].forEach(key);
  expect(screen.getByTestId('sheet-amount')).toHaveClass('empty');
  expect(screen.getByTestId('sheet-total')).toHaveTextContent('16.835 €');
  fireEvent.click(screen.getByRole('button', { name: /Speichern/ }));
  expect(await screen.findByText('Dein Beitrag ist zurückgezogen.')).toBeInTheDocument();
  expect(puts()).toEqual([['/api/me/hours', { hours: 75.5 }], ['/api/me/contribution', { amount: 0 }]]);
});

test('Esc closes the sheet without saving', async () => {
  server();
  render(<MemberApp />);
  fireEvent.click(await screen.findByRole('button', { name: 'Beitrag ändern' }));
  type(screen.getByLabelText('Dein Beitrag in Euro'), ['5']);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(puts()).toEqual([]);
  expect(screen.getByTestId('own-amount')).toHaveTextContent('1.585');
});

test('a bid without an answer is sent again', async () => {
  jest.useFakeTimers();
  server({ failFirst: true });
  render(<MemberApp />);
  await act(async () => {});
  fireEvent.click(screen.getByRole('button', { name: 'Beitrag ändern' }));
  type(screen.getByLabelText('Dein Beitrag in Euro'), ['0']);
  fireEvent.click(screen.getByRole('button', { name: /Speichern/ }));
  await act(async () => {});
  expect(screen.getByRole('button', { name: 'Wird gespeichert …' })).toBeDisabled();
  await act(async () => { jest.advanceTimersByTime(1000); });
  expect(await screen.findByText('Dein Beitrag ist jetzt 15.850 €.')).toBeInTheDocument();
  expect(puts()).toEqual([['/api/me/contribution', { amount: 15850 }], ['/api/me/contribution', { amount: 15850 }]]);
  jest.useRealTimers();
});
