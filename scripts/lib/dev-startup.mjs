import { spawnSync } from 'node:child_process'

export function ensureDevDatabaseReady(npmCommand, options = {}) {
  const run = options.spawnSync ?? spawnSync
  const result = run(npmCommand, ['run', 'migrate-db'], {
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? process.env,
    stdio: options.stdio ?? 'inherit',
  })

  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`Database migration readiness failed with code ${result.status ?? 1}.`)
  }
}
