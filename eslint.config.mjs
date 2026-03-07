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
    ],
  },
];

export default eslintConfig;
