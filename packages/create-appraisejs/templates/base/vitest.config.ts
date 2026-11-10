import path from 'path'
import { configDefaults, defineConfig } from 'vitest/config'

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
    exclude: [
      ...configDefaults.exclude,
      // These suites require a fresh owned case and run through the M06 harness configs.
      'src/services/coordinator/quality-journey-authoring-owner.sqlite.integration.test.ts',
      'src/services/coordinator/quality-journey-discovery-selected-use.sqlite.integration.test.ts',
      'src/services/coordinator/quality-journey-e2-retirement-service.sqlite.integration.test.ts',
      'src/services/coordinator/quality-journey-remaining-authoring-owner.sqlite.integration.test.ts',
      'src/services/coordinator/quality-journey-selected-use.sqlite.integration.test.ts',
      'src/services/locator-group/locator-group-service.e2.sqlite.integration.test.ts',
      'src/services/module/module-service.e2.sqlite.integration.test.ts',
    ],
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
