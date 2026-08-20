import { existsSync } from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

/** Ensure the local managed-execution package exists before the web and MCP
 * servers accept work. Published packages already include this build output. */
export function ensureCucumberRuntimeReadiness(npmCommand, options = {}) {
  const cwd = options.cwd ?? process.cwd()
  const requiredFiles = ['index.js', 'hooks.js'].map(file =>
    path.join(cwd, 'packages', 'cucumber-runtime', 'dist', file),
  )
  const filesExist = () => requiredFiles.every(options.existsSync ?? existsSync)
  if (filesExist()) return { built: false, requiredFiles }

  const result = (options.spawnSync ?? spawnSync)(npmCommand, ['run', 'build:cucumber-runtime'], {
    cwd,
    env: options.env ?? process.env,
    stdio: options.stdio ?? 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`Cucumber runtime readiness failed with code ${result.status ?? 1}.`)
  if (!filesExist()) throw new Error(`Cucumber runtime readiness did not produce ${requiredFiles.join(' and ')}.`)
  return { built: true, requiredFiles }
}
