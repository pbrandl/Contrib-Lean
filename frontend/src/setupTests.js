// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// jsdom has no crypto.getRandomValues; the device id needs it (as every real browser has it).
if (!window.crypto || !window.crypto.getRandomValues) {
  Object.defineProperty(window, 'crypto', { value: require('crypto').webcrypto, configurable: true });
}
