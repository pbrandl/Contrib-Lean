import { t } from './i18n';
import { ApiError, TIMEOUT_MS, api, deviceId, isNewer, loginWithPin, rememberTrust, trustFor } from './lib';

const respond = (body, status = 200, headers = {}) => Promise.resolve({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (name) => headers[name.toLowerCase()] || null },
  json: () => Promise.resolve(body)
});

beforeEach(() => {
  window.localStorage.clear();
});

test('device id: 22 base64url characters, kept in localStorage, sent with every request', async () => {
  const id = deviceId();
  expect(id).toMatch(/^[A-Za-z0-9_-]{22}$/);
  expect(deviceId()).toBe(id);
  expect(JSON.parse(window.localStorage.getItem('franzwerk.device'))).toBe(id);
  globalThis.fetch = vi.fn(() => respond({ ok: true }));
  await api('/public');
  expect(globalThis.fetch.mock.calls[0][1].headers['X-Device']).toBe(id);
});

test('trusted-device credentials: newest first, one per account, at most 10', () => {
  for (let i = 0; i < 12; i += 1) rememberTrust(`u${i}`, `t${i}`);
  rememberTrust('u11', 'neu');
  const list = JSON.parse(window.localStorage.getItem('franzwerk.trust'));
  expect(list).toHaveLength(10);
  expect(list[0]).toEqual({ uid: 'u11', trust: 'neu' });
  expect(trustFor('u11')).toBe('neu');
  expect(trustFor('u0')).toBeUndefined();
  rememberTrust('u5', undefined);
  expect(trustFor('u5')).toBe('t5');
});

test('login sends device id and credential, stores the new credential, returns the session', async () => {
  rememberTrust('42', 'alt');
  globalThis.fetch = vi.fn(() => respond({ token: 'tok', role: 'member', user: { id: '42' }, trust: 'neu' }));
  const session = await loginWithPin('42', '2580');
  const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
  expect(body).toEqual({ userId: '42', pin: '2580', device: deviceId(), trust: 'alt' });
  expect(session).toEqual({ token: 'tok', role: 'member', user: { id: '42' } });
  expect(trustFor('42')).toBe('neu');
});

test('errors carry status, message and Retry-After', async () => {
  globalThis.fetch = vi.fn(() => respond({ error: 'Zu viele Fehlversuche.' }, 429, { 'retry-after': '60' }));
  await expect(api('/login', { method: 'POST', body: {} })).rejects.toMatchObject({ status: 429, message: 'Zu viele Fehlversuche.', retryAfter: 60 });
});

test('the proxy page of a stopped server counts as maintenance, the server\'s own 503 does not', async () => {
  globalThis.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 502, headers: { get: () => null }, json: () => Promise.reject(new SyntaxError('HTML')) }));
  await expect(api('/public')).rejects.toMatchObject({ status: 502, maintenance: true, message: t('errors.maintenance') });
  globalThis.fetch = vi.fn(() => respond({ error: 'Der Server ist gerade ausgelastet.' }, 503));
  await expect(api('/login', { method: 'POST', body: {} })).rejects.toMatchObject({ status: 503, maintenance: false, message: 'Der Server ist gerade ausgelastet.' });
});

test('a request without an answer fails after the timeout', async () => {
  vi.useFakeTimers();
  globalThis.fetch = vi.fn((url, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')));
  }));
  const pending = api('/me');
  vi.advanceTimersByTime(TIMEOUT_MS);
  const error = await pending.catch(e => e);
  expect(error).toBeInstanceOf(ApiError);
  expect(error.status).toBe(0);
  expect(error.timeout).toBe(true);
  vi.useRealTimers();
});

test('responses: a newer rev wins, after a server restart (restored backup) the new state wins', () => {
  expect(isNewer({ rev: 5, boot: 'a' }, null)).toBe(true);
  expect(isNewer({ rev: 4, boot: 'a' }, { rev: 5, boot: 'a' })).toBe(false);
  expect(isNewer({ rev: 5, boot: 'a' }, { rev: 5, boot: 'a' })).toBe(true);
  expect(isNewer({ rev: 2, boot: 'b' }, { rev: 5, boot: 'a' })).toBe(true);
});
