import path from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    include: [
      'scripts/lib/**/*.test.ts',
      'src/services/**/*.test.ts',
      'src/app/**/*.test.ts',
      'src/app/**/*.test.tsx',
      'src/actions/**/*.test.ts',
      'src/lib/sync/**/*.test.ts',
      'src/components/**/*.test.ts',
      'src/components/**/*.test.tsx',
    ],
  },
})
