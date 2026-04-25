import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // jsdom is future-friendly for React hook tests; streamChat tests work fine here too
    environment: 'jsdom',
    globals: false,
    setupFiles: ['src/test/setup.ts'],
  },
});
