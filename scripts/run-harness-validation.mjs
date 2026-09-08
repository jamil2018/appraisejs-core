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
const result = executeValidationPlan(plan, session)
disposeValidationSession(session)
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
process.exit(result.status)
