import { useCallback, useEffect, useRef, useState } from 'react';

const API_URL = process.env.REACT_APP_API_URL || '/api';

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function api(path, { method = 'GET', body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: 'no-store'
    });
  } catch {
    throw new ApiError(0, 'Keine Verbindung zum Server. Prüfe dein Internet und versuche es noch einmal.');
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    // empty or non-JSON body
  }
  if (!response.ok) {
    throw new ApiError(response.status, (data && data.error) || `Serverfehler (${response.status}). Bitte versuche es noch einmal.`);
  }
  return data;
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

// Formatting

const wholeNumber = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
const withCents = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const round2 = (n) => Math.round(n * 100) / 100;
export const formatNumber = (n) => (Number.isInteger(round2(n)) ? wholeNumber : withCents).format(round2(n));
export const formatEuro = (n) => `${formatNumber(n)}\u00a0€`;
export const countBids = (n) => (n === 1 ? '1 Gebot' : `${n} Gebote`);
export const formatHours = (n) => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(n);

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

export const isPin = (pin) => /^\d{4,6}$/.test(pin);

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
