// Matchers like toHaveTextContent, toBeDisabled (https://github.com/testing-library/jest-dom).
import '@testing-library/jest-dom/vitest';
import { webcrypto } from 'node:crypto';
import { TextDecoder, TextEncoder } from 'node:util';

// Testing Library moves fake timers forward inside waitFor/findBy* only when it finds the
// `jest` global; Vitest's fake timers work the same way, so it gets the one call it makes.
globalThis.jest = { advanceTimersByTime: (ms) => vi.advanceTimersByTime(ms) };

// jsdom has no crypto.getRandomValues; the device id needs it (as every real browser has it).
if (!window.crypto || !window.crypto.getRandomValues) {
  Object.defineProperty(window, 'crypto', { value: webcrypto, configurable: true });
}

// jsdom has no TextDecoder (reading import files needs it).
if (typeof globalThis.TextDecoder === 'undefined') {
  Object.assign(globalThis, { TextDecoder, TextEncoder });
}

// The tests read the German texts: the browser asks for German, and every test starts
// with the default settings.
Object.defineProperty(window.navigator, 'languages', { value: ['de-DE', 'de'], configurable: true });
beforeEach(() => {
  window.localStorage.removeItem('franzwerk.settings');
  document.documentElement.classList.remove('dark');
});
