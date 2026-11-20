/// <reference types="vitest/jsdom" />

import "@testing-library/jest-dom/vitest";

// Vitest can retain the host's localStorage property instead of jsdom's storage.
Object.defineProperty(window, "localStorage", {
  configurable: true,
  writable: true,
  value: jsdom.window.localStorage,
});

Object.defineProperty(window, "scrollTo", {
  writable: true,
  value: () => {},
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
