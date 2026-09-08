import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import {
  createValidationPlan,
  createValidationSession,
  disposeValidationSession,
  executeValidationPlan,
  readValidationRegistry,
} from './lib/harness-validation.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const registry = readValidationRegistry(root)
const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), 'appraise-harness-benchmark-'))
const delay = [process.execPath, '-e', 'setTimeout(() => process.exit(0), 20)']

function fixtureRegistry() {
  return {
    ...registry,
    prerequisites: [{ id: 'runtime', command: delay, timeoutMs: 1000, retryLimit: 0, inputPatterns: ['src/**'] }],
    commands: [
      { id: 'first', command: delay, stages: ['local'], prerequisites: ['runtime'], timeoutMs: 1000, retryLimit: 0 },
      { id: 'second', command: delay, stages: ['local'], prerequisites: ['runtime'], timeoutMs: 1000, retryLimit: 0 },
      { id: 'harness-contracts', command: delay, stages: ['pre-commit'], timeoutMs: 1000, retryLimit: 0 },
      { id: 'fallow-commit', command: delay, stages: ['pre-commit'], timeoutMs: 1000, retryLimit: 0 },
      { id: 'react-doctor-commit', command: delay, stages: ['pre-commit'], timeoutMs: 1000, retryLimit: 0 },
    ],
    surfaces: [
      { id: 'source', patterns: ['src/**'], commands: ['first', 'second'] },
      {
        id: 'documentation',
        patterns: ['docs/**/*.md'],
        commands: ['harness-contracts', 'fallow-commit', 'react-doctor-commit'],
      },
    ],
    documentationPatterns: ['docs/**/*.md'],
    sharedConfigurationPatterns: ['package.json'],
  }
}

function run(plan, session) {
  const started = performance.now()
  const result = executeValidationPlan(plan, session)
  return { result, wallDurationMs: Number((performance.now() - started).toFixed(2)) }
}

try {
  mkdirSync(path.join(fixtureRoot, 'src'))
  mkdirSync(path.join(fixtureRoot, 'docs'))
  writeFileSync(path.join(fixtureRoot, 'src', 'fixture.ts'), 'export const fixture = true\n')
  writeFileSync(path.join(fixtureRoot, 'docs', 'fixture.md'), '# fixture\n')
  const measured = fixtureRegistry()
  const sourcePlan = createValidationPlan({
    registry: measured,
    changes: [{ status: 'M', path: 'src/fixture.ts' }],
    stage: 'local',
  })
  const naiveFirst = createValidationSession({ root: fixtureRoot, registry: measured, toolchain: 'fixture' })
  const naiveSecond = createValidationSession({ root: fixtureRoot, registry: measured, toolchain: 'fixture' })
  const baseline = [
    run({ ...sourcePlan, commands: [sourcePlan.commands[0]] }, naiveFirst),
    run({ ...sourcePlan, commands: [sourcePlan.commands[1]] }, naiveSecond),
  ]
  disposeValidationSession(naiveFirst)
  disposeValidationSession(naiveSecond)
  const optimizedSession = createValidationSession({ root: fixtureRoot, registry: measured, toolchain: 'fixture' })
  const optimized = run(sourcePlan, optimizedSession)
  disposeValidationSession(optimizedSession)
  const documentationPlan = createValidationPlan({
    registry: measured,
    changes: [{ status: 'M', path: 'docs/fixture.md' }],
    stage: 'pre-commit',
  })
  const documentationSession = createValidationSession({ root: fixtureRoot, registry: measured, toolchain: 'fixture' })
  const documentation = run(documentationPlan, documentationSession)
  disposeValidationSession(documentationSession)
  const legacyDocumentationSession = createValidationSession({
    root: fixtureRoot,
    registry: measured,
    toolchain: 'fixture',
  })
  const legacyDocumentation = run(
    {
      ...documentationPlan,
      commands: measured.commands.filter(command =>
        ['harness-contracts', 'fallow-commit', 'react-doctor-commit'].includes(command.id),
      ),
    },
    legacyDocumentationSession,
  )
  disposeValidationSession(legacyDocumentationSession)

  const output = {
    baseline: 'config/development-harness/validation-benchmark-baseline.json',
    provenance:
      'Observed wall-clock measurements from temporary fixture Node commands only. They measure prerequisite reuse and documentation-hook selection, not application validation performance.',
    scenarios: [
      {
        id: 'prerequisite-reuse',
        kind: 'observed-fixture',
        baseline: {
          commandCount: baseline.flatMap(item => item.result.events).length,
          retries: 0,
          agentCount: 0,
          wallDurationMs: Number(baseline.reduce((sum, item) => sum + item.wallDurationMs, 0).toFixed(2)),
        },
        optimized: {
          commandCount: optimized.result.events.filter(event => !event.reused).length,
          retries: 0,
          agentCount: 0,
          wallDurationMs: optimized.wallDurationMs,
          reusedPrerequisites: optimized.result.events.filter(event => event.type === 'prerequisite' && event.reused)
            .length,
        },
      },
      {
        id: 'documentation-only-hooks',
        kind: 'observed-fixture',
        baseline: {
          commandCount: legacyDocumentation.result.events.filter(event => !event.reused).length,
          retries: 0,
          agentCount: 0,
          wallDurationMs: legacyDocumentation.wallDurationMs,
        },
        optimized: {
          commandCount: documentation.result.events.filter(event => !event.reused).length,
          retries: 0,
          agentCount: 0,
          wallDurationMs: documentation.wallDurationMs,
          skippedCodeAnalysisHooks: ['fallow-commit', 'react-doctor-commit'],
        },
      },
    ],
  }
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true })
}
