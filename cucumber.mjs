/**
 * @type {import('@cucumber/cucumber/lib/configuration').IConfiguration}
 */

export default {
  paths: ['src/features/**/*.feature'],
  import: ['src/steps/**/*.ts', 'src/hooks/hooks.ts', 'src/config/world.ts'],
  loader: ['ts-node/esm'],
  format: [process.env.REPORT_FORMAT ?? `json:${process.env.REPORT_PATH ?? 'src/reports/cucumber.json'}`],
  publishQuiet: true,
}
