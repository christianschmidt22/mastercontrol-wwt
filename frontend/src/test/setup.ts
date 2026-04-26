// Test setup file.
// Use the vitest-aware import path so jest-dom's matchers register against
// vitest's expect WITHOUT relying on globals: true.
import '@testing-library/jest-dom/vitest';

// With `globals: false`, @testing-library/react's auto-cleanup hook isn't
// registered (it relies on a global `afterEach`). Register cleanup explicitly
// so DOM nodes from a prior test don't bleed into the next one.
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
afterEach(() => {
  cleanup();
});
