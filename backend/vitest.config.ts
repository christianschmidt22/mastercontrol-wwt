import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.ts'],
    pool: 'forks', // each test file gets its own process + DB
    // Windows can intermittently terminate parallel fork workers under the
    // full backend suite. Keep the default test command deterministic.
    fileParallelism: false,
    hookTimeout: 30_000,
  },
});
