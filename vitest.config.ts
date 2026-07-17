import path from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@locator-picker-companion': path.resolve(__dirname, './packages/locator-picker-companion/src'),
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: [
      'packages/cucumber-runtime/src/**/*.test.ts',
      'scripts/lib/**/*.test.ts',
      'src/services/**/*.test.ts',
      'src/app/**/*.test.ts',
      'src/app/**/*.test.tsx',
      'src/actions/**/*.test.ts',
      'src/lib/**/*.test.ts',
      'src/components/**/*.test.ts',
      'src/components/**/*.test.tsx',
    ],
  },
})
