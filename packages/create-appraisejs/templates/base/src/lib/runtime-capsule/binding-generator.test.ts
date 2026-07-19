import { execFileSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { generateExecutableBindings } from './binding-generator'

async function expectGeneratedBindingToDryRun(root: string, source: string, feature: string) {
  await Promise.all([
    fs.mkdir(path.join(root, 'features')),
    fs.mkdir(path.join(root, 'bindings')),
    fs.mkdir(path.join(root, 'reports')),
  ])
  await Promise.all([
    fs.writeFile(path.join(root, 'features/test.feature'), feature),
    fs.writeFile(path.join(root, 'bindings/test.mjs'), source),
    fs.writeFile(
      path.join(root, 'cucumber.mjs'),
      "export default { paths: ['features/test.feature'], import: ['bindings/test.mjs'], format: ['json:reports/test.json'], publishQuiet: true }\n",
    ),
  ])
  expect(() =>
    execFileSync(
      process.execPath,
      [path.resolve('node_modules/@cucumber/cucumber/bin/cucumber.js'), '--config', 'cucumber.mjs', '--dry-run'],
      { cwd: root, stdio: 'pipe' },
    ),
  ).not.toThrow()
}

describe('executable binding generator', () => {
  it('registers and dry-runs the frozen generated step independently', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-binding-generator-'))
    try {
      const runtimeImport = pathToFileURL(path.resolve('packages/cucumber-runtime/dist/index.js')).href
      const source = generateExecutableBindings({
        runtimeImport,
        selectors: {},
        bindings: [
          {
            caseId: 'case',
            steps: [{ id: 'step', keywordText: 'When it runs', action: 'browser.navigation.reload@1', parameters: [] }],
          },
        ],
      })
      expect(source).toContain("'labels' in element")
      expect(source).toContain("element.getAttribute('aria-labelledby')")
      expect(source).toContain('browser.assertions.no-console-errors@1')
      expect(source).toContain('browser.assertions.no-failed-network-requests@1')
      await expectGeneratedBindingToDryRun(root, source, 'Feature: Test\n  Scenario: Run\n    When it runs\n')
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })

  it('registers repeated equivalent phrases once so the dry-run remains unambiguous', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-binding-generator-repeated-'))
    try {
      const runtimeImport = pathToFileURL(path.resolve('packages/cucumber-runtime/dist/index.js')).href
      const repeatedStep = {
        action: 'browser.navigation.reload@1',
        parameters: [],
      }
      const source = generateExecutableBindings({
        runtimeImport,
        selectors: {},
        bindings: [
          {
            caseId: 'case',
            steps: [
              { id: 'first', keywordText: 'When the page reloads', ...repeatedStep },
              { id: 'second', keywordText: 'And the page reloads', ...repeatedStep },
            ],
          },
        ],
      })
      expect(source).toContain('.split(/\\s+/)')
      await expectGeneratedBindingToDryRun(
        root,
        source,
        'Feature: Test\n  Scenario: Run\n    When the page reloads\n    And the page reloads\n',
      )
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})
