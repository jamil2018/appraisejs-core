import { describe, expect, it } from 'vitest'
import { buildJsonReportFormat } from './automation-path-roots'

describe('buildJsonReportFormat', () => {
  it('uses a project-relative path so Windows drive letters stay unambiguous', () => {
    const reportPath = `${process.cwd()}\\automation\\reports\\run-1\\cucumber.json`
    expect(buildJsonReportFormat(reportPath)).toBe('json:automation/reports/run-1/cucumber.json')
  })

  it('normalizes relative report paths to forward slashes', () => {
    const reportPath = 'automation\\reports\\run-1\\cucumber.json'
    expect(buildJsonReportFormat(reportPath)).toBe('json:automation/reports/run-1/cucumber.json')
  })
})
