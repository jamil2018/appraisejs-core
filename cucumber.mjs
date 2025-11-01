// eslint-disable-next-line import/no-anonymous-default-export
export default {
  paths: ['src/tests/features/**/*.feature'],
  import: ['src/tests/steps/**/*.ts', 'src/tests/hooks/hooks.ts', 'src/tests/config/world.ts'],
  loader: ['ts-node/esm'],
  format: ['pretty', process.env.REPORT_FORMAT ?? `json:${process.env.REPORT_PATH ?? 'src/reports/cucumber.json'}`],
  publishQuiet: true,
}
