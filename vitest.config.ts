import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    testTimeout: 30_000,
    // Exclude frontend tests — they have their own config
    exclude: ['frontend/**', 'node_modules/**'],
  },
});
