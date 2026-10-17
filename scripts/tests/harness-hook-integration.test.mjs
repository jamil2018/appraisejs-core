import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

function run(root, command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', timeout: 30000 })
  assert.ifError(result.error)
  return result
}

function git(root, ...args) {
  const result = run(root, 'git', args)
  assert.equal(result.status, 0, result.stderr)
  return result.stdout
}

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'appraise-hook-integration-'))
  mkdirSync(path.join(root, 'scripts/lib'), { recursive: true })
  mkdirSync(path.join(root, 'config/development-harness'), { recursive: true })
  mkdirSync(path.join(root, 'docs'))
  for (const filename of [
    'scripts/run-harness-validation.mjs',
    'scripts/lib/harness-validation.mjs',
    'scripts/lib/cucumber-runtime-fingerprint.mjs',
  ]) {
    copyFileSync(path.join(sourceRoot, filename), path.join(root, filename))
  }
  symlinkSync(path.join(sourceRoot, 'node_modules'), path.join(root, 'node_modules'))
  const packageScript = JSON.parse(readFileSync(path.join(sourceRoot, 'package.json'), 'utf8')).scripts[
    'quality:pre-commit'
  ]
  writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({ type: 'module', scripts: { 'quality:pre-commit': packageScript } }),
  )
  writeFileSync(path.join(root, 'package-lock.json'), '{}')
  writeFileSync(path.join(root, 'docs/guide.md'), '# guide\n')
  writeFileSync(path.join(root, 'scripts/fixture.mjs'), 'export const fixture = true\n')
  const command = (id, script) => ({
    id,
    command: [process.execPath, '-e', script],
    stages: ['pre-commit'],
    timeoutMs: 10000,
    retryLimit: 0,
  })
  const registry = {
    version: 1,
    documentationPatterns: ['docs/**/*.md'],
    sharedConfigurationPatterns: ['package.json'],
    prerequisites: [],
    commands: [
      command('harness-contracts', 'console.log("harness contract diagnostic")'),
      command('fallow-commit', 'console.log("fallow diagnostic")'),
      command('react-doctor-commit', 'console.log("react doctor diagnostic")'),
    ],
    surfaces: [
      {
        id: 'documentation',
        patterns: ['docs/**/*.md'],
        commands: ['harness-contracts', 'fallow-commit', 'react-doctor-commit'],
      },
      {
        id: 'harness',
        patterns: ['scripts/**', 'config/development-harness/**'],
        commands: ['harness-contracts', 'fallow-commit', 'react-doctor-commit'],
      },
    ],
  }
  writeFileSync(path.join(root, 'config/development-harness/validation-registry.json'), JSON.stringify(registry))
  git(root, 'init', '-q')
  git(root, 'config', 'user.name', 'Hook Fixture')
  git(root, 'config', 'user.email', 'hook@example.test')
  git(root, 'add', '.')
  git(root, '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'fixture')
  copyFileSync(path.join(sourceRoot, '.git/hooks/pre-commit'), path.join(root, '.git/hooks/pre-commit'))
  return { root, registry }
}

test('installed pre-commit entrypoint selects docs and harness checks and retains diagnostics', () => {
  const { root } = fixture()
  try {
    writeFileSync(path.join(root, 'docs/guide.md'), '# changed\n')
    const docs = run(root, 'sh', ['.git/hooks/pre-commit'])
    assert.equal(docs.status, 0, docs.stderr)
    assert.match(docs.stdout, /harness contract diagnostic/)
    assert.doesNotMatch(docs.stdout, /fallow diagnostic|react doctor diagnostic/)
    git(root, 'restore', 'docs/guide.md')

    writeFileSync(path.join(root, 'scripts/fixture.mjs'), 'export const fixture = false\n')
    const harness = run(root, 'sh', ['.git/hooks/pre-commit'])
    assert.equal(harness.status, 0, harness.stderr)
    assert.match(harness.stdout, /harness contract diagnostic/)
    assert.match(harness.stdout, /fallow diagnostic/)
    assert.match(harness.stdout, /react doctor diagnostic/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('hook fails with child diagnostics and inventory includes staged, unstaged, untracked, rename, and delete', () => {
  const { root, registry } = fixture()
  try {
    git(root, 'mv', 'docs/guide.md', 'docs/renamed.md')
    git(root, 'rm', 'scripts/fixture.mjs')
    writeFileSync(path.join(root, 'docs/renamed.md'), '# unstaged\n')
    writeFileSync(path.join(root, 'unknown.config'), 'untracked\n')
    const plan = run(root, process.execPath, ['scripts/run-harness-validation.mjs', '--pre-commit'])
    assert.equal(plan.status, 0, plan.stderr)
    const inventory = JSON.parse(plan.stdout)
    assert.ok(inventory.changes.some(change => change.status === 'R' && change.oldPath === 'docs/guide.md'))
    assert.ok(inventory.changes.some(change => change.status === 'M' && change.path === 'docs/renamed.md'))
    assert.ok(inventory.changes.some(change => change.status === 'D' && change.path === 'scripts/fixture.mjs'))
    assert.ok(inventory.changes.some(change => change.status === 'U' && change.path === 'unknown.config'))
    assert.equal(inventory.broadened, true)
    assert.equal(inventory.documentationOnly, false)

    registry.commands[0].command = [
      process.execPath,
      '-e',
      'console.error("full fixture failure diagnostic");process.exit(7)',
    ]
    writeFileSync(path.join(root, 'config/development-harness/validation-registry.json'), JSON.stringify(registry))
    const hook = run(root, 'sh', ['.git/hooks/pre-commit'])
    assert.equal(hook.status, 7)
    assert.match(hook.stderr, /full fixture failure diagnostic/)
    assert.match(hook.stdout, /harness-contracts: FAILED/)
    assert.match(hook.stdout, /exit 7/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
