import path from 'path'

function buildJsonReportFormat(reportPath) {
  const normalizedPath = path.isAbsolute(reportPath)
    ? path.relative(process.cwd(), reportPath).replace(/\\/g, '/')
    : reportPath.replace(/\\/g, '/')
  return `json:${normalizedPath}`
}

// eslint-disable-next-line import/no-anonymous-default-export
export default {
  paths: ['automation/features/**/*.feature'],
  import: [
    'packages/cucumber-runtime/src/parameter-types.ts',
    'automation/steps/**/*.ts',
    'packages/cucumber-runtime/src/hooks.ts',
    'packages/cucumber-runtime/src/world.ts',
  ],
  loader: ['ts-node/esm'],
  format: [
    'pretty',
    process.env.REPORT_FORMAT ??
      buildJsonReportFormat(process.env.REPORT_PATH ?? 'automation/reports/cucumber.json'),
  ],
  publishQuiet: true,
}
