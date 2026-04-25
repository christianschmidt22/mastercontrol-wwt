import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    // jsdom is future-friendly for React hook tests; streamChat tests work fine here too
    environment: 'jsdom',
    globals: false,
    setupFiles: ['src/test/setup.ts'],
  },
});
