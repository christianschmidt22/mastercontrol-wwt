import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.ts'],
    pool: 'forks', // each test file gets its own process + DB
    fileParallelism: true,
    hookTimeout: 30_000,
  },
});
