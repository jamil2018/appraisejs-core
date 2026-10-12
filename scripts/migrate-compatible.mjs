import { spawnSync } from 'node:child_process'
import { assertDatabaseCompatibility } from './lib/database-compatibility.mjs'

try {
  await assertDatabaseCompatibility({ allowPending: true })
  const result = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['prisma', 'migrate', 'deploy'], {
    stdio: 'inherit',
    env: process.env,
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`Database upgrade failed with code ${result.status ?? 1}.`)
  await assertDatabaseCompatibility()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
