import { render, screen } from '@testing-library/react';
import App from './App';

const respond = (body) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  global.fetch = jest.fn(() => respond({
    rev: 1,
    totalRaised: 1250,
    targetAmount: 6500,
    contributorCount: 2,
    totalHours: 12.5,
    members: [{ id: '2', name: 'Steffen' }, { id: '1', name: 'Anna' }]
  }));
});

test('front page shows logo, progress and member list without PINs', async () => {
  window.history.pushState({}, '', '/');
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'Wähle deinen Namen' })).toBeInTheDocument();
  expect(screen.getByAltText('FRANZ!werk Tübingen')).toBeInTheDocument();
  expect(screen.getByText('von 6.500 € Bedarf')).toBeInTheDocument();
  expect(screen.getByText('12,5')).toBeInTheDocument();
  expect(screen.getByText('pro Monat')).toBeInTheDocument();
  const names = screen.getAllByRole('listitem').map(li => li.querySelector('button').textContent);
  expect(names).toEqual(['AAnna', 'SSteffen']);
  expect(screen.getByRole('button', { name: 'Anna' })).toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledWith('/api/public', expect.anything());
});

test('/admin shows the admin login', async () => {
  window.history.pushState({}, '', '/admin');
  render(<App />);
  expect(await screen.findByRole('heading', { name: 'Admin' })).toBeInTheDocument();
  expect(screen.getByLabelText('PIN')).toBeInTheDocument();
});
