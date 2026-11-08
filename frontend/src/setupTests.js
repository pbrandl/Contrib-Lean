// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// jsdom has no crypto.getRandomValues; the device id needs it (as every real browser has it).
if (!window.crypto || !window.crypto.getRandomValues) {
  Object.defineProperty(window, 'crypto', { value: require('crypto').webcrypto, configurable: true });
}

// jsdom has no TextDecoder (reading import files needs it).
if (typeof global.TextDecoder === 'undefined') {
  const { TextDecoder, TextEncoder } = require('util');
  Object.assign(global, { TextDecoder, TextEncoder });
}

// The tests read the German texts: the browser asks for German, and every test starts
// with the default settings.
Object.defineProperty(window.navigator, 'languages', { value: ['de-DE', 'de'], configurable: true });
beforeEach(() => {
  window.localStorage.removeItem('franzwerk.settings');
  document.documentElement.classList.remove('dark');
});
