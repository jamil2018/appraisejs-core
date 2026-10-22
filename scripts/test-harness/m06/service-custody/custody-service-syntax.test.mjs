// Parse-only regression checks. --check never evaluates the fixture entries or imports their dependencies.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const directory = path.dirname(fileURLToPath(import.meta.url))
for (const filename of readdirSync(directory).filter(filename => filename.endsWith('.mjs'))) {
  test(`actual Node ESM syntax is valid: ${filename}`, () => {
    const result = spawnSync(process.execPath, ['--check', path.join(directory, filename)], {
      encoding: 'utf8',
    })
    assert.equal(result.error, undefined)
    assert.equal(result.signal, null)
    assert.equal(result.status, 0, result.stderr)
  })
}
