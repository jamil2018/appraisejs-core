import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [
      'packages/cucumber-runtime/dist/**/*',
      'packages/locator-picker-companion/dist/**/*',
      'packages/appraisejs/registry/**/*',
      'templates/**/*',
      'packages/create-appraisejs/templates/**/*',
    ],
  },
  {
    files: ['automation/steps/**/*.step.ts'],
    rules: {
      'no-duplicate-imports': 'error',
      'no-redeclare': 'error',
    },
  },
]

export default eslintConfig
