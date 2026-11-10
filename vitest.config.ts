import path from 'path'
import { configDefaults, defineConfig } from 'vitest/config'

const sourceCustodySuites = [
  'src/lib/quality-journey/codex-app-server/outcome-source-sqlite-journal.test.ts',
  'src/lib/quality-journey/codex-app-server/outcome-source.sqlite.test.ts',
  'src/lib/quality-journey/provider-source-database.sqlite.test.ts',
]
const runPinnedSourceCustody = process.env.APPRAISE_PINNED_SOURCE_CUSTODY === '1'

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
      ...(runPinnedSourceCustody ? [] : sourceCustodySuites),
      // These suites require a fresh owned case and run through the M06 harness configs.
      'src/services/coordinator/quality-journey-authoring-owner.sqlite.integration.test.ts',
      'src/services/coordinator/quality-journey-discovery-selected-use.sqlite.integration.test.ts',
      'src/services/coordinator/quality-journey-e2-retirement-service.sqlite.integration.test.ts',
      'src/services/coordinator/quality-journey-remaining-authoring-owner.sqlite.integration.test.ts',
      'src/services/coordinator/quality-journey-selected-use.sqlite.integration.test.ts',
      'src/services/locator-group/locator-group-service.e2.sqlite.integration.test.ts',
      'src/services/module/module-service.e2.sqlite.integration.test.ts',
    ],
    include: runPinnedSourceCustody
      ? sourceCustodySuites
      : [
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
