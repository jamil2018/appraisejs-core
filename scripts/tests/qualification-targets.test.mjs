import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const scriptsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fixturesRoot = path.join(scriptsRoot, 'fixtures', 'qualification-targets')

function runVerifier(target) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['verify.mjs'], {
      cwd: path.join(fixturesRoot, target),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout.on('data', chunk => {
      output += String(chunk)
    })
    child.stderr.on('data', chunk => {
      output += String(chunk)
    })
    child.once('error', reject)
    child.once('exit', (code, signal) => resolve({ code, signal, output }))
  })
}

function runManagedLifecycle() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      [
        'vitest',
        'run',
        'src/services/coordinator/coordinator-capsule-lifecycle.e2e.test.ts',
        'src/services/coordinator/coordinator-baseline-service.test.ts',
        'src/services/test-run/runtime-capsule-test-run-service.integration.test.ts',
        'src/services/coordinator/qualification-target-baseline.integration.test.ts',
      ],
      { cwd: path.resolve(scriptsRoot, '..'), stdio: ['ignore', 'pipe', 'pipe'] },
    )
    let output = ''
    child.stdout.on('data', chunk => {
      output += String(chunk)
    })
    child.stderr.on('data', chunk => {
      output += String(chunk)
    })
    child.once('error', reject)
    child.once('exit', (code, signal) => resolve({ code, signal, output }))
  })
}

test('passing editor SPA provides a successful target result', async () => {
  const result = await runVerifier('passing-editor-spa')
  assert.equal(result.signal, null)
  assert.equal(result.code, 0, result.output)
  assert.match(result.output, /QUALIFICATION_PASSED editor-spa/)
})

test('expected product target fails its product assertion without an API error envelope', async () => {
  const result = await runVerifier('expected-product-failure')
  assert.equal(result.signal, null)
  assert.notEqual(result.code, 0)
  assert.match(result.output, /QUALIFICATION_PRODUCT_FAILURE expected saved editor state/)
  assert.doesNotMatch(result.output, /appraise\.error\/v1/)
})

test('infrastructure target reports a real process interruption', async () => {
  const result = await runVerifier('infrastructure-interruption')
  assert.equal(result.signal, null)
  assert.equal(result.code, 0, result.output)
  assert.match(result.output, /QUALIFICATION_INTERRUPTED signal=SIGTERM/)
})

test('qualification targets are exercised through Appraise-managed publication, capsule, baseline, and recovery lifecycles', async () => {
  const result = await runManagedLifecycle()
  assert.equal(result.signal, null)
  assert.equal(result.code, 0, result.output)
  assert.match(result.output, /Test Files\s+4 passed/)
  assert.match(result.output, /Tests\s+27 passed/)
})
