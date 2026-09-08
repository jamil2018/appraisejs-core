import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import {
  collectGitChanges,
  createValidationPlan,
  createValidationSession,
  documentedCiRequirements,
  disposeValidationSession,
  executeCommand,
  executeValidationPlan,
  isDocumentationOnlyChange,
  matchesPattern,
  parseNameStatus,
  prerequisiteFingerprint,
  validateValidationRegistry,
  verifyCiCoverage,
} from '../lib/harness-validation.mjs'
import {
  cucumberRuntimeArtifactFingerprint,
  cucumberRuntimeInputFingerprint,
  cucumberRuntimeReceiptIsCurrent,
} from '../lib/cucumber-runtime-fingerprint.mjs'

function registry() {
  return validateValidationRegistry({
    version: 1,
    documentationPatterns: ['docs/**/*.md', '*.md'],
    sharedConfigurationPatterns: ['package.json', '.github/**'],
    prerequisites: [
      {
        id: 'runtime',
        command: ['node', '--version'],
        timeoutMs: 1000,
        retryLimit: 1,
        inputPatterns: ['src/**', 'package.json'],
      },
    ],
    commands: [
      {
        id: 'harness-contracts',
        command: ['node', '--version'],
        stages: ['local', 'pre-commit', 'ci'],
        timeoutMs: 1000,
        retryLimit: 0,
        ciCommand: 'npm run check:harness',
        ciJob: 'root',
      },
      {
        id: 'analysis',
        command: ['node', '--version'],
        stages: ['pre-commit'],
        prerequisites: ['runtime'],
        timeoutMs: 1000,
        retryLimit: 1,
      },
      {
        id: 'build',
        command: ['node', '--version'],
        stages: ['ci'],
        timeoutMs: 1000,
        retryLimit: 0,
        ciCommand: 'npm run build',
        ciJob: 'root',
      },
      {
        id: 'fallow-commit',
        command: ['node', '--version'],
        stages: ['pre-commit'],
        timeoutMs: 1000,
        retryLimit: 0,
      },
      {
        id: 'react-doctor-commit',
        command: ['node', '--version'],
        stages: ['pre-commit'],
        timeoutMs: 1000,
        retryLimit: 0,
      },
    ],
    surfaces: [
      {
        id: 'docs',
        patterns: ['docs/**/*.md', '*.md'],
        commands: ['harness-contracts', 'fallow-commit', 'react-doctor-commit'],
      },
      { id: 'source', patterns: ['src/**'], commands: ['analysis', 'fallow-commit', 'react-doctor-commit'] },
      {
        id: 'config',
        patterns: ['package.json', '.github/**'],
        commands: ['harness-contracts', 'analysis', 'fallow-commit', 'react-doctor-commit'],
      },
    ],
  })
}

function cucumberFixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'harness-cucumber-'))
  mkdirSync(path.join(root, 'packages/cucumber-runtime/src'), { recursive: true })
  mkdirSync(path.join(root, 'packages/cucumber-runtime/dist'), { recursive: true })
  writeFileSync(path.join(root, 'package.json'), '{}\n')
  writeFileSync(path.join(root, 'package-lock.json'), '{}\n')
  writeFileSync(path.join(root, 'tsconfig.json'), '{}\n')
  writeFileSync(path.join(root, 'packages/cucumber-runtime/package.json'), '{}\n')
  writeFileSync(path.join(root, 'packages/cucumber-runtime/tsconfig.json'), '{}\n')
  writeFileSync(path.join(root, 'packages/cucumber-runtime/src/index.ts'), 'export const value = 1\n')
  writeFileSync(path.join(root, 'packages/cucumber-runtime/dist/index.js'), 'exports.value = 1\n')
  return root
}

function cucumberRegistry() {
  return validateValidationRegistry({
    version: 1,
    documentationPatterns: ['docs/**/*.md'],
    sharedConfigurationPatterns: ['package.json'],
    prerequisites: [
      {
        id: 'cucumber-runtime',
        command: ['node', '--version'],
        timeoutMs: 1000,
        retryLimit: 0,
        inputPatterns: [
          'packages/cucumber-runtime/src/**',
          'packages/cucumber-runtime/package.json',
          'packages/cucumber-runtime/tsconfig.json',
          'package.json',
          'package-lock.json',
          'tsconfig*.json',
        ],
      },
    ],
    commands: [
      {
        id: 'unit',
        command: ['node', '--version'],
        stages: ['pre-commit'],
        prerequisites: ['cucumber-runtime'],
        timeoutMs: 1000,
        retryLimit: 0,
      },
      {
        id: 'build',
        command: ['node', '--version'],
        stages: ['pre-commit'],
        timeoutMs: 1000,
        retryLimit: 0,
      },
    ],
    surfaces: [{ id: 'source', patterns: ['src/**'], commands: ['unit', 'build'] }],
  })
}

test('normalizes staged, untracked, renamed, and deleted Git paths', () => {
  const commandOutput = new Map([
    ['diff --name-status -z', 'M\0src/a.ts\0R100\0docs/old.md\0docs/new.md\0'],
    ['diff --cached --name-status -z', 'D\0src/deleted.ts\0'],
    ['ls-files --others --exclude-standard -z', 'src/untracked.ts\0'],
  ])
  const changes = collectGitChanges('/fixture', (_root, args) => commandOutput.get(args.join(' ')))
  assert.deepEqual(changes, [
    { status: 'M', path: 'src/a.ts' },
    { status: 'R', oldPath: 'docs/old.md', path: 'docs/new.md' },
    { status: 'D', path: 'src/deleted.ts' },
    { status: 'U', path: 'src/untracked.ts' },
  ])
})

test('documentation-only detection rejects config, source, rename, and deletion changes', () => {
  const subject = registry()
  assert.equal(isDocumentationOnlyChange([{ status: 'M', path: 'docs/readme.md' }], subject), true)
  assert.equal(isDocumentationOnlyChange([{ status: 'M', path: 'package.json' }], subject), false)
  assert.equal(isDocumentationOnlyChange([{ status: 'D', path: 'src/removed.ts' }], subject), false)
  assert.equal(isDocumentationOnlyChange([{ status: 'R', oldPath: 'src/old.ts', path: 'docs/new.md' }], subject), false)
})

test('unknown and shared configuration changes broaden validation selection', () => {
  const subject = registry()
  const unknown = createValidationPlan({
    registry: subject,
    stage: 'pre-commit',
    changes: [{ status: 'U', path: 'tool.config' }],
  })
  assert.equal(unknown.broadened, true)
  assert.deepEqual(unknown.selectedSurfaces, ['docs', 'source', 'config'])
  const configuration = createValidationPlan({
    registry: subject,
    stage: 'pre-commit',
    changes: [{ status: 'M', path: 'package.json' }],
  })
  assert.equal(configuration.broadened, true)
  assert.ok(configuration.commands.some(command => command.id === 'analysis'))
})

test('documentation-only pre-commit plans omit code-analysis hooks', () => {
  const plan = createValidationPlan({
    registry: registry(),
    stage: 'pre-commit',
    changes: [{ status: 'M', path: 'docs/guide.md' }],
  })
  assert.equal(plan.documentationOnly, true)
  assert.deepEqual(
    plan.commands.map(command => command.id),
    ['harness-contracts'],
  )
})

test('CI plans retain every registry CI command regardless of the changed surface', () => {
  const plan = createValidationPlan({
    registry: registry(),
    stage: 'ci',
    changes: [{ status: 'M', path: 'docs/guide.md' }],
  })
  assert.deepEqual(
    plan.commands.map(command => command.id),
    ['harness-contracts', 'build'],
  )
})

test('reuses a valid prerequisite and invalidates it after relevant input or toolchain changes', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'harness-validation-'))
  try {
    mkdirSync(path.join(root, 'src'))
    writeFileSync(path.join(root, 'src', 'value.ts'), 'export const value = 1\n')
    writeFileSync(path.join(root, 'package.json'), '{}\n')
    const subject = registry()
    const session = createValidationSession({ root, registry: subject, toolchain: 'node-1' })
    const plan = createValidationPlan({
      registry: subject,
      stage: 'pre-commit',
      changes: [{ status: 'M', path: 'src/value.ts' }],
    })
    const executions = []
    const execute = item => {
      executions.push(item.id)
      return { status: 0, durationMs: 1, retries: 0, timedOut: false }
    }
    const first = executeValidationPlan(plan, session, { executeCommand: execute })
    const second = executeValidationPlan(plan, session, { executeCommand: execute })
    assert.equal(first.events.filter(event => event.id === 'runtime')[0].reused, false)
    assert.equal(second.events.filter(event => event.id === 'runtime')[0].reused, true)
    const before = prerequisiteFingerprint(session, subject.prerequisites[0])
    writeFileSync(path.join(root, 'src', 'value.ts'), 'export const value = 2\n')
    const after = prerequisiteFingerprint(session, subject.prerequisites[0])
    assert.notEqual(before, after)
    const third = executeValidationPlan(plan, session, { executeCommand: execute })
    assert.equal(third.events.filter(event => event.id === 'runtime')[0].reused, false)
    session.toolchain = 'node-2'
    const fourth = executeValidationPlan(plan, session, { executeCommand: execute })
    assert.equal(fourth.events.filter(event => event.id === 'runtime')[0].reused, false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('binds Cucumber prerequisite reuse to source and generated artifact content', () => {
  const root = cucumberFixture()
  try {
    const subject = cucumberRegistry()
    const plan = createValidationPlan({
      registry: subject,
      stage: 'pre-commit',
      changes: [{ status: 'M', path: 'src/test.ts' }],
    })
    const session = createValidationSession({ root, registry: subject, toolchain: 'fixture' })
    const execute = () => ({ status: 0, durationMs: 1, retries: 0, timedOut: false })
    const first = executeValidationPlan(plan, session, { executeCommand: execute })
    const second = executeValidationPlan(plan, session, { executeCommand: execute })
    assert.equal(first.events[0].reused, false)
    assert.equal(second.events[0].reused, true)
    writeFileSync(path.join(root, 'packages/cucumber-runtime/dist/index.js'), 'exports.value = 2\n')
    const afterArtifactChange = executeValidationPlan(plan, session, { executeCommand: execute })
    assert.equal(afterArtifactChange.events[0].reused, false)
    writeFileSync(path.join(root, 'packages/cucumber-runtime/src/index.ts'), 'export const value = 2\n')
    const afterInputChange = executeValidationPlan(plan, session, { executeCommand: execute })
    assert.equal(afterInputChange.events[0].reused, false)
    disposeValidationSession(session)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('shares a verified Cucumber receipt from unit work with the following build and rejects tampering', () => {
  const root = cucumberFixture()
  try {
    const subject = cucumberRegistry()
    const plan = createValidationPlan({
      registry: subject,
      stage: 'pre-commit',
      changes: [{ status: 'M', path: 'src/test.ts' }],
    })
    const session = createValidationSession({ root, registry: subject, toolchain: 'fixture' })
    let observedReceipt
    const result = executeValidationPlan(plan, session, {
      executeCommand: item => {
        if (item.id === 'build') observedReceipt = session.environment.APPRAISE_CUCUMBER_RUNTIME_RECEIPT
        return { status: 0, durationMs: 1, retries: 0, timedOut: false }
      },
    })

    assert.equal(result.status, 0)
    assert.ok(observedReceipt)
    assert.equal(cucumberRuntimeReceiptIsCurrent(root, observedReceipt), true)

    writeFileSync(path.join(root, 'packages/cucumber-runtime/dist/index.js'), 'exports.value = "tampered"\n')
    assert.equal(cucumberRuntimeReceiptIsCurrent(root, observedReceipt), false)
    disposeValidationSession(session)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('rejects a Cucumber prerequisite when its inputs change during the build', () => {
  const root = cucumberFixture()
  try {
    const subject = cucumberRegistry()
    const plan = createValidationPlan({
      registry: subject,
      stage: 'pre-commit',
      changes: [{ status: 'M', path: 'src/test.ts' }],
    })
    const session = createValidationSession({ root, registry: subject, toolchain: 'fixture' })
    const result = executeValidationPlan(plan, session, {
      executeCommand: item => {
        if (item.id === 'cucumber-runtime')
          writeFileSync(path.join(root, 'packages/cucumber-runtime/src/index.ts'), 'export const value = 9\n')
        return { status: 0, durationMs: 1, retries: 0, timedOut: false }
      },
    })
    assert.equal(result.status, 1)
    assert.equal(result.events[0].inputChanged, true)
    disposeValidationSession(session)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('fingerprints Cucumber input and artifact content and refuses external symlink inputs', () => {
  const root = cucumberFixture()
  const external = mkdtempSync(path.join(os.tmpdir(), 'harness-external-'))
  try {
    const input = cucumberRuntimeInputFingerprint(root)
    const artifact = cucumberRuntimeArtifactFingerprint(root)
    writeFileSync(path.join(root, 'packages/cucumber-runtime/src/index.ts'), 'export const value = 3\n')
    assert.notEqual(cucumberRuntimeInputFingerprint(root), input)
    writeFileSync(path.join(root, 'packages/cucumber-runtime/dist/index.js'), 'exports.value = 3\n')
    assert.notEqual(cucumberRuntimeArtifactFingerprint(root), artifact)
    symlinkSync(external, path.join(root, 'packages/cucumber-runtime/src/external.ts'))
    assert.throws(() => cucumberRuntimeInputFingerprint(root), /external symlink/)
  } finally {
    rmSync(root, { recursive: true, force: true })
    rmSync(external, { recursive: true, force: true })
  }
})

test('validates bounded commands and CI parity', () => {
  assert.throws(() => validateValidationRegistry({ ...registry(), commands: [] }), /references/)
  const workflow = {
    jobs: {
      root: { steps: [{ run: 'npm run check:harness' }, { run: 'npm run build' }] },
      'release-check': { needs: ['root'] },
    },
  }
  assert.equal(verifyCiCoverage(registry(), workflow, { requirements: [] }), true)
  assert.throws(
    () =>
      verifyCiCoverage(
        registry(),
        {
          jobs: { root: { steps: [{ run: 'npm run check:harness' }] }, 'release-check': { needs: ['root'] } },
        },
        { requirements: [] },
      ),
    /npm run build/,
  )
  assert.throws(
    () =>
      verifyCiCoverage(
        registry(),
        {
          jobs: {
            root: { 'continue-on-error': true, steps: [{ run: 'npm run check:harness' }, { run: 'npm run build' }] },
            'release-check': { needs: ['root'] },
          },
        },
        { requirements: [] },
      ),
    /npm run check:harness/,
  )
})

test('reports retries as failed attempts after the initial attempt', () => {
  const command = { command: ['node', '--version'], timeoutMs: 1000, retryLimit: 0 }
  let calls = 0
  const failed = executeCommand(command, process.cwd(), {}, () => {
    calls += 1
    return { status: 1 }
  })
  assert.equal(calls, 1)
  assert.equal(failed.retries, 0)
  assert.equal(failed.status, 1)

  command.retryLimit = 1
  calls = 0
  const retried = executeCommand(command, process.cwd(), {}, () => {
    calls += 1
    return { status: calls === 2 ? 0 : 1 }
  })
  assert.equal(calls, 2)
  assert.equal(retried.retries, 1)
  assert.equal(retried.status, 0)
})

test('derives CI coverage from verified release findings and documented migration and operation gates', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
  const requirements = documentedCiRequirements(root)
  for (const command of [
    'npm run release:check:artifacts',
    'npm run docs:check-links',
    'npx prisma generate',
    'node e2e/apply-migrations.mjs',
    'npm run release:check:operation-projections',
    'npm run release:check -- --ledger-only',
  ]) {
    assert.ok(requirements.includes(command), command)
  }
  assert.ok(requirements.includes('npm run quality:fallow:release'))
  assert.ok(requirements.includes('npm run release:check:mcp-http'))
  assert.ok(requirements.includes('npm run benchmark:repository-queries'))
})

test('matches recursive glob patterns used by the registry', () => {
  assert.equal(matchesPattern('docs/agent-harness.md', 'docs/**/*.md'), true)
  assert.equal(matchesPattern('docs/nested/agent-harness.md', 'docs/**/*.md'), true)
  assert.equal(matchesPattern('src/lib/file.ts', 'src/**'), true)
  assert.equal(matchesPattern('package.json', 'package.json'), true)
  assert.deepEqual(parseNameStatus('R100\0a.md\0b.md\0'), [{ status: 'R', oldPath: 'a.md', path: 'b.md' }])
})
