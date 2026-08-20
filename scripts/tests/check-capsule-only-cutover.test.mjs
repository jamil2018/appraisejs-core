import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const guard = path.resolve('scripts/check-capsule-only-cutover.mjs')

test('rejects a forbidden compatibility file that exists only in the scaffold', () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'appraise-capsule-guard-'))
  try {
    const scripts = {
      setup: 'npm run sync-step-definitions',
      'sync-step-definitions': 'node scripts/sync-step-definitions.js',
    }
    fs.writeFileSync(path.join(fixture, 'package.json'), JSON.stringify({ scripts }))
    const forbidden = path.join(
      fixture,
      'packages/create-appraisejs/templates/base/src/services/locator/locator-path-utils.ts',
    )
    fs.mkdirSync(path.dirname(forbidden), { recursive: true })
    fs.writeFileSync(forbidden, 'export const legacyLocatorPath = true\n')

    assert.throws(
      () => execFileSync(process.execPath, [guard], { cwd: fixture, encoding: 'utf8', stdio: 'pipe' }),
      error => {
        assert.match(String(error.stderr), /locator-path-utils\.ts:forbidden compatibility file/)
        return true
      },
    )
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true })
  }
})
