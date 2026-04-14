import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [
      'automation/steps/**/*.step.ts',
      'automation/steps/**/*',
      'packages/cucumber-runtime/dist/**/*',
      'packages/locator-picker-companion/dist/**/*',
      'packages/appraisejs/registry/**/*',
      'templates/**/*',
      'packages/create-appraisejs/templates/**/*',
    ],
  },
];

export default eslintConfig;
