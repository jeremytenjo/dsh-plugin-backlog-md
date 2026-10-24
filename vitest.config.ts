import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/client/**/*.test.ts', 'test/client/**/*.test.tsx'],
    environment: 'jsdom',
    setupFiles: ['test/client/setup.ts'],
    restoreMocks: true,
    clearMocks: true,
    testTimeout: 15000,
  },
});
