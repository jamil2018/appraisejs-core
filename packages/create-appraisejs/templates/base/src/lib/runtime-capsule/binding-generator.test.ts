import { execFileSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { generateExecutableBindings } from './binding-generator'

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
      await fs.mkdir(path.join(root, 'features'))
      await fs.mkdir(path.join(root, 'bindings'))
      await fs.mkdir(path.join(root, 'reports'))
      await fs.writeFile(path.join(root, 'features/test.feature'), 'Feature: Test\n  Scenario: Run\n    When it runs\n')
      await fs.writeFile(path.join(root, 'bindings/test.mjs'), source)
      await fs.writeFile(
        path.join(root, 'cucumber.mjs'),
        "export default { paths: ['features/test.feature'], import: ['bindings/test.mjs'], format: ['json:reports/test.json'], publishQuiet: true }\n",
      )
      expect(() =>
        execFileSync(
          process.execPath,
          [path.resolve('node_modules/@cucumber/cucumber/bin/cucumber.js'), '--config', 'cucumber.mjs', '--dry-run'],
          { cwd: root, stdio: 'pipe' },
        ),
      ).not.toThrow()
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})
