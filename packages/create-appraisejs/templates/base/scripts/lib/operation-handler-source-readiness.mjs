import { spawnSync } from 'node:child_process'
import path from 'node:path'

function sourceCheckOptions(options) {
  return {
    spawn: options.spawnSync ?? spawnSync,
    env: options.env ?? process.env,
    stdio: options.stdio ?? 'inherit',
  }
}

/** Fail closed when the checked-in handler identity does not cover current runtime source. */
export function ensureOperationHandlerSourceCurrent(options = {}) {
  const cwd = options.cwd ?? process.cwd()
  const check = sourceCheckOptions(options)
  const result = check.spawn(
    process.execPath,
    [path.join(cwd, 'scripts/generate-operation-handler-source-hash.mjs'), '--check'],
    { cwd, env: check.env, stdio: check.stdio },
  )
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error('Operation handler source hash is stale.')
}
