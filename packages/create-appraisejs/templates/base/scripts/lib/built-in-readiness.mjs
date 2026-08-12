import { spawnSync } from 'node:child_process'

/** Run the canonical source-owned Step Definition readiness gate before a
 * local server exposes authoring or coordinator behavior. */
export function ensureBuiltInStepDefinitionReadiness(npmCommand) {
  const readiness = spawnSync(npmCommand, ['run', 'sync-step-definitions'], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  })
  if (readiness.error) throw readiness.error
  if (readiness.status !== 0)
    throw new Error(`Built-in Step Definition readiness failed with code ${readiness.status ?? 1}.`)
}
