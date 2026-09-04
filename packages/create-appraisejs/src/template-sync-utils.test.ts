import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  extractModulePathFromAutomationFile,
  getAutomationLocatorMapPath,
  shouldBackfillLegacyEnvironmentConfig,
  shouldExcludeTemplatePath,
} from '../../../src/lib/template-sync-utils.js'
import { resolveQualityOsBehavioralSuites } from '../../../src/lib/quality-os-certification-suites.js'
import { describe, expect, it } from 'vitest'

describe('shouldExcludeTemplatePath', () => {
  it('excludes report artifacts, plan artifacts, Graphify output, database files, and OS artifacts', () => {
    expect(shouldExcludeTemplatePath('automation/reports/logs/run.log')).toBe(true)
    expect(shouldExcludeTemplatePath('src/graphify-out/graph.json')).toBe(true)
    expect(shouldExcludeTemplatePath('prisma/graphify-out/GRAPH_REPORT.md')).toBe(true)
    expect(shouldExcludeTemplatePath('scripts/graphify-out/graph.html')).toBe(true)
    expect(shouldExcludeTemplatePath('prisma/dev.db')).toBe(true)
    expect(shouldExcludeTemplatePath('tsconfig.tsbuildinfo')).toBe(true)
    expect(shouldExcludeTemplatePath('automation/steps/.DS_Store')).toBe(true)
    expect(shouldExcludeTemplatePath('src/lib/quality-journey/scenario-contracts.mcp-parity.test.ts')).toBe(true)
    expect(shouldExcludeTemplatePath('lib/quality-journey/scenario-contracts.mcp-parity.test.ts')).toBe(true)
  })

  it('keeps normal source files and config files', () => {
    expect(shouldExcludeTemplatePath('automation/features/base/login.feature')).toBe(false)
    expect(shouldExcludeTemplatePath('prisma/schema.prisma')).toBe(false)
    expect(shouldExcludeTemplatePath('package.json')).toBe(false)
  })
})

describe('shouldBackfillLegacyEnvironmentConfig', () => {
  it('backs fills only when the target file is missing and the legacy directory exists', () => {
    expect(shouldBackfillLegacyEnvironmentConfig(false, true)).toBe(true)
    expect(shouldBackfillLegacyEnvironmentConfig(true, true)).toBe(false)
    expect(shouldBackfillLegacyEnvironmentConfig(false, false)).toBe(false)
  })
})

describe('Quality OS certification suite scoping', () => {
  it('keeps the generated-app certifier install-free when repository-only parity is absent', () => {
    const generatedApp = mkdtempSync(path.join(os.tmpdir(), 'appraise-template-certifier-'))
    try {
      const suites = resolveQualityOsBehavioralSuites(generatedApp)
      for (const suite of suites) {
        const file = path.join(generatedApp, suite)
        mkdirSync(path.dirname(file), { recursive: true })
        writeFileSync(file, '')
      }
      expect(resolveQualityOsBehavioralSuites(generatedApp)).toEqual(suites)
      expect(suites).not.toContain('src/lib/quality-journey/scenario-contracts.mcp-parity.test.ts')
      expect(suites.every(suite => existsSync(path.join(generatedApp, suite)))).toBe(true)
    } finally {
      rmSync(generatedApp, { recursive: true, force: true })
    }
  })

  it('probes the prepared template certifier without installing template dependencies', () => {
    const templateRoot = path.resolve(process.cwd(), 'templates/base')
    const output = execFileSync(
      process.execPath,
      ['--import', 'tsx', 'scripts/certify-quality-os.ts', '--check-suites'],
      {
        cwd: templateRoot,
        encoding: 'utf8',
      },
    )
    expect(output).toContain('behavioralSuites')
    expect(output).not.toContain('scenario-contracts.mcp-parity.test.ts')
  })
})

describe('extractModulePathFromAutomationFile', () => {
  it('derives locator module paths from automation locators', () => {
    expect(extractModulePathFromAutomationFile('/repo/automation/locators/base/login.json', '/repo', 'locators')).toBe(
      '/base',
    )
  })

  it('derives nested feature module paths from automation features', () => {
    expect(
      extractModulePathFromAutomationFile(
        '/repo/automation/features/users/admins/directors/login.feature',
        '/repo',
        'features',
      ),
    ).toBe('/users/admins/directors')
  })

  it('handles windows-style paths', () => {
    expect(
      extractModulePathFromAutomationFile(
        'C:\\repo\\automation\\locators\\users\\admins\\dashboard.json',
        'C:\\repo',
        'locators',
      ),
    ).toBe('/users/admins')
  })

  it('returns the root module for top-level feature files', () => {
    expect(extractModulePathFromAutomationFile('/repo/automation/features/login.feature', '/repo', 'features')).toBe(
      '/',
    )
  })
})

describe('getAutomationLocatorMapPath', () => {
  it('points locator-map.json into the automation workspace', () => {
    expect(getAutomationLocatorMapPath('/repo')).toBe('/repo/automation/mapping/locator-map.json')
  })
})
