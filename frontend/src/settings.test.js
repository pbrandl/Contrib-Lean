import { fireEvent, screen, waitFor } from '@testing-library/react';
import App from './App';
import { render as renderWithSettings } from './test-utils';
import { render } from '@testing-library/react';
import { setLanguage } from './i18n';
import { NotFoundPage } from './ui';
import { VERSION } from './version';

const respond = (body) => Promise.resolve({ ok: true, status: 200, headers: { get: () => null }, json: () => Promise.resolve(body) });

beforeEach(() => {
  window.localStorage.clear();
  window.history.pushState({}, '', '/');
  global.fetch = jest.fn(() => respond({ rev: 1, totalRaised: 1250, totalRaisedGross: 1487.5, targetAmount: 6500, contributorCount: 2, totalHours: 12.5, members: [{ id: '1', name: 'Anna' }] }));
});
afterEach(() => setLanguage('de'));

test('the settings page opens from the front page and switches language, theme and amounts at once', async () => {
  render(<App />);
  expect(await screen.findByText('Wähle deinen Namen')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Einstellungen' }));
  const dialog = screen.getByRole('dialog', { name: 'Einstellungen' });
  expect(dialog).toHaveTextContent(`Bietrunde ${VERSION}`);

  fireEvent.click(screen.getByRole('radio', { name: 'English' }));
  expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
  expect(document.documentElement.lang).toBe('en');
  fireEvent.click(screen.getByRole('radio', { name: /Dark/ }));
  expect(document.documentElement).toHaveClass('dark');
  fireEvent.click(screen.getByRole('radio', { name: 'Gross' }));
  fireEvent.keyDown(document, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

  expect(screen.getByText('Choose your name')).toBeInTheDocument();
  expect(screen.getByText('of 7,735 € gross')).toBeInTheDocument();
  expect(screen.getByText('1,488')).toBeInTheDocument();
  expect(JSON.parse(window.localStorage.getItem('franzwerk.settings'))).toEqual({ theme: 'dark', language: 'en', amounts: 'brutto' });
});

test('without saved settings: the browser language, the device theme and the netto/brutto choice of version 1', () => {
  Object.defineProperty(window.navigator, 'languages', { value: ['es-MX', 'en'], configurable: true });
  window.localStorage.setItem('franzwerk.mode', JSON.stringify('brutto'));
  window.matchMedia = jest.fn(query => ({ matches: query === '(prefers-color-scheme: dark)', media: query, addEventListener: jest.fn(), removeEventListener: jest.fn() }));
  renderWithSettings(<NotFoundPage />);
  expect(screen.getByText('Página no encontrada')).toBeInTheDocument();
  expect(document.documentElement).toHaveClass('dark');
  fireEvent.click(screen.getByRole('button', { name: 'Ajustes' }));
  expect(screen.getByRole('radio', { name: 'Bruto' })).toBeChecked();
  expect(screen.getByRole('radio', { name: 'Sistema' })).toBeChecked();
  Object.defineProperty(window.navigator, 'languages', { value: ['de-DE', 'de'], configurable: true });
  delete window.matchMedia;
});

test('the version on the settings page is the one in package.json', () => {
  expect(VERSION).toBe(require('../package.json').version);
});
