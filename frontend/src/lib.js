import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEMO, demoApi } from './demo';

const API_URL = process.env.REACT_APP_API_URL || '/api';

// A request that gets no answer within this time fails, so a page never hangs.
export const TIMEOUT_MS = 15000;

// status 0: no answer. `timeout`: the request may still have reached the server.
export class ApiError extends Error {
  constructor(status, message, { retryAfter = 0, timeout = false } = {}) {
    super(message);
    this.status = status;
    this.retryAfter = retryAfter;
    this.timeout = timeout;
  }
}

// `timeout`: longer for requests that may take a while on the server (import).
export async function api(path, { method = 'GET', body, token, timeout = TIMEOUT_MS } = {}) {
  if (DEMO) {
    try {
      return await demoApi(path, { method, body, token });
    } catch (err) {
      throw new ApiError(err.status || 500, err.message);
    }
  }
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const device = deviceId();
  if (device) headers['X-Device'] = device;

  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  let timedOut = false;
  const timer = controller ? setTimeout(() => { timedOut = true; controller.abort(); }, timeout) : null;

  try {
    let response;
    try {
      response = await fetch(`${API_URL}${path}`, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        cache: 'no-store',
        signal: controller ? controller.signal : undefined
      });
    } catch {
      if (timedOut) {
        throw new ApiError(0, 'Der Server antwortet gerade nicht. Versuche es gleich noch einmal.', { timeout: true });
      }
      throw new ApiError(0, 'Keine Verbindung zum Server. Prüfe dein Internet und versuche es noch einmal.');
    }

    let data = null;
    try {
      data = await response.json();
    } catch {
      // empty or non-JSON body (or the answer stopped halfway)
    }
    if (!response.ok) {
      const retryAfter = Number(response.headers && response.headers.get && response.headers.get('Retry-After')) || 0;
      throw new ApiError(response.status, (data && data.error) || `Serverfehler (${response.status}). Bitte versuche es noch einmal.`, { retryAfter });
    }
    if (timedOut) {
      throw new ApiError(0, 'Der Server antwortet gerade nicht. Versuche es gleich noch einmal.', { timeout: true });
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

// Sessions: members stay logged in on their own phone (localStorage),
// the admin session ends with the browser tab (sessionStorage).

function stored(getStore, key) {
  return {
    get() {
      try {
        return JSON.parse(getStore().getItem(key));
      } catch {
        return null;
      }
    },
    set(value) {
      try {
        getStore().setItem(key, JSON.stringify(value));
      } catch {
        // storage disabled (e.g. private mode): the session lasts until reload
      }
    },
    clear() {
      try {
        getStore().removeItem(key);
      } catch {
        // see above
      }
    }
  };
}

export const memberSession = stored(() => window.localStorage, 'franzwerk.member');
export const adminSession = stored(() => window.sessionStorage, 'franzwerk.admin');

// Device id: random per browser and sent with every request. Wrong PINs then lock only
// this device (not the whole WLAN), and the audit log can tell devices apart.
// Same format as DEVICE_PATTERN in backend/server.js: 22 base64url characters.
const DEVICE_PATTERN = /^[A-Za-z0-9_-]{22}$/;
const deviceStore = stored(() => window.localStorage, 'franzwerk.device');
let currentDevice;

function randomDeviceId() {
  const cryptoApi = typeof window !== 'undefined' ? window.crypto : null;
  if (!cryptoApi || !cryptoApi.getRandomValues) return null; // never a weak id
  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function deviceId() {
  if (currentDevice !== undefined) return currentDevice;
  const saved = deviceStore.get();
  if (typeof saved === 'string' && DEVICE_PATTERN.test(saved)) {
    currentDevice = saved;
  } else {
    currentDevice = randomDeviceId();
    if (currentDevice) deviceStore.set(currentDevice);
  }
  return currentDevice;
}

// After a right PIN the server returns a "trusted device" credential for this account.
// With it, this device can still log in while somebody else is guessing PINs for the
// account. It is useless without the PIN, so it stays after logging out. Up to 10 accounts
// per device (shared phones).
const trustStore = stored(() => window.localStorage, 'franzwerk.trust');
const MAX_TRUSTED_ACCOUNTS = 10;

const trustList = () => {
  const list = trustStore.get();
  return Array.isArray(list) ? list.filter(e => e && typeof e.uid === 'string' && typeof e.trust === 'string') : [];
};

export function trustFor(userId) {
  const entry = trustList().find(e => e.uid === userId);
  return entry ? entry.trust : undefined;
}

export function rememberTrust(userId, trust) {
  if (typeof trust !== 'string' || !trust) return;
  const others = trustList().filter(e => e.uid !== userId);
  trustStore.set([{ uid: userId, trust }, ...others].slice(0, MAX_TRUSTED_ACCOUNTS));
}

// Login with device id and credential; returns the session (without the credential).
export async function loginWithPin(userId, pin) {
  const { trust, ...session } = await api('/login', {
    method: 'POST',
    body: { userId, pin, device: deviceId() || undefined, trust: trustFor(userId) }
  });
  rememberTrust(userId, trust);
  return session;
}

// Responses can overtake each other; `rev` grows with every change on the server.
// `boot` changes with every server start, so a restored backup (lower rev) is accepted.
export const isNewer = (next, prev) => !prev || next.boot !== prev.boot || next.rev >= prev.rev;

// Formatting

const wholeNumber = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
const withCents = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const round2 = (n) => Math.round(n * 100) / 100;
export const formatNumber = (n) => (Number.isInteger(round2(n)) ? wholeNumber : withCents).format(round2(n));
export const formatEuro = (n) => `${formatNumber(n)}\u00a0€`;
export const countBids = (n) => (n === 1 ? '1 Gebot' : `${n} Gebote`);
export const formatHours = (n) => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(n);
// The total of all bids and the Bedarf are shown in whole euros; the server keeps the cents.
export const formatWhole = (n) => wholeNumber.format(Math.round(n));

// Amounts are stored, sent and summed netto. Brutto is only a display option.
export const VAT_PERCENT = 19;
// In whole cents, like toGross in backend/server.js, so half cents round up (12,50 -> 14,88).
export const toGross = (net) => Math.round((Math.round(net * 100) * (100 + VAT_PERCENT)) / 100) / 100;
// A brutto amount typed by a member, in netto, rounded up to the cent (agreed: shown as
// brutto again, it may differ by 1 cent). Integer cents, so 1886,15 gives exactly 1585.
export const toNet = (gross) => Math.ceil((Math.round(gross * 100) * 100) / (100 + VAT_PERCENT)) / 100;
export const inMode = (net, mode) => (mode === 'brutto' ? toGross(net) : net);
// Brutto as the server reports it: a bid typed brutto keeps exactly that amount (it is
// leading), any other bid is netto x 1.19. The fallbacks are for a server without it.
export const ownGross = (me) => (typeof me.contributionGross === 'number' ? me.contributionGross : toGross(me.contribution));
export const totalGross = (s) => (typeof s.totalRaisedGross === 'number' ? s.totalRaisedGross : toGross(s.totalRaised));

// Netto or brutto display, stored per device. Default is netto.
export function useAmountMode(key) {
  const store = useMemo(() => stored(() => window.localStorage, key), [key]);
  const [mode, setMode] = useState(() => (store.get() === 'brutto' ? 'brutto' : 'netto'));
  const toggle = useCallback(() => {
    const next = mode === 'brutto' ? 'netto' : 'brutto';
    store.set(next);
    setMode(next);
  }, [mode, store]);
  return [mode, toggle];
}

// "Müller" is found when searching "muller".
export const fold = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('de');
export const byName = (a, b) => a.name.localeCompare(b.name, 'de', { sensitivity: 'base' });

// Accepts "6500", "6.500", "6500,50", "12.50" and "1.234,56 €".
export function parseAmount(input) {
  let s = String(input).replace(/[€\s\u00a0]/g, '');
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(',', '.');
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

export const isPin = (pin) => /^\d{4,8}$/.test(pin);

// Calls `callback` every `ms` while the page is visible, and right away when it becomes visible again.
export function usePolling(callback, ms, active = true) {
  const saved = useRef(callback);
  useEffect(() => {
    saved.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!active) return undefined;
    const tick = () => {
      if (document.visibilityState === 'visible') saved.current();
    };
    const id = setInterval(tick, ms);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [ms, active]);
}

// A short message at the top of the page; confirmations disappear on their own.
export function useNotice() {
  const [notice, setNotice] = useState(null);
  useEffect(() => {
    if (!notice || notice.tone === 'error') return undefined;
    const id = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(id);
  }, [notice]);
  const show = useCallback((tone, text) => setNotice({ tone, text, at: Date.now() }), []);
  const clear = useCallback(() => setNotice(null), []);
  return [notice, show, clear];
}

export function download(fileName, type, content) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const today = () => new Date().toISOString().slice(0, 10);
