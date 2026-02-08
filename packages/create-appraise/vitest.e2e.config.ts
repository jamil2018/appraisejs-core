import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.e2e.test.ts'],
    testTimeout: 60000,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
