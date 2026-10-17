import { fileURLToPath } from 'node:url'
import {
  collectGitChanges,
  createValidationPlan,
  createValidationSession,
  disposeValidationSession,
  executeValidationPlan,
  readValidationRegistry,
  verifyCiCoverage,
} from './lib/harness-validation.mjs'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = new Set(process.argv.slice(2))
const stage = args.has('--ci') ? 'ci' : args.has('--pre-commit') ? 'pre-commit' : 'local'
const registry = readValidationRegistry(root)
const changes = collectGitChanges(root)
const plan = createValidationPlan({ registry, changes, stage })

if (args.has('--verify-ci')) {
  verifyCiCoverage(registry, readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8'), { root })
  if (!args.has('--execute')) {
    console.log('Validation registry CI coverage is complete.')
    process.exit(0)
  }
}
if (!args.has('--execute')) {
  process.stdout.write(`${JSON.stringify({ ...plan, commands: plan.commands.map(command => command.id) }, null, 2)}\n`)
  process.exit(0)
}

const session = createValidationSession({ root, registry })
try {
  const result = executeValidationPlan(plan, session)
  for (const event of result.events) {
    const label = event.type === 'prerequisite' ? 'prerequisite' : 'command'
    const outcome = event.reused ? 'reused' : event.status === 0 ? 'passed' : 'FAILED'
    process.stdout.write(
      `[harness-validation] ${label} ${event.id}: ${outcome} (${event.durationMs} ms, ${event.retries} retries)\n`,
    )
    if (event.timedOut || event.error) {
      process.stderr.write(`[harness-validation] ${event.id}: ${event.error ?? 'command timed out'}\n`)
    }
  }
  process.stdout.write(`[harness-validation] exit ${result.status}\n`)
  process.exitCode = result.status
} finally {
  disposeValidationSession(session)
}
