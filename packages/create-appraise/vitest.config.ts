import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['**/e2e/**', '**/*.e2e.test.ts'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
