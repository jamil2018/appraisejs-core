import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [
      "src/tests/steps/**/*.step.ts", // Exclude generated template step files
      "src/tests/steps/**/*", // Exclude all files in steps directory
    ],
  },
];

export default eslintConfig;
