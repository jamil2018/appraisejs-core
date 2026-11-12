import { spawnSync } from 'node:child_process'
import { closeSync, openSync } from 'node:fs'
import { assertDatabaseCompatibility, databaseCompatibilityUrl } from './lib/database-compatibility.mjs'

try {
  const readiness = await assertDatabaseCompatibility({ allowPending: true })
  if (readiness.status === 'NEW_DATABASE') {
    const { databasePath } = databaseCompatibilityUrl(process.cwd())
    // Prisma deploy can refuse a missing SQLite file. Create only an empty file;
    // migration SQL and Prisma still establish every schema/ledger entry.
    try {
      closeSync(openSync(databasePath, 'wx', 0o600))
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
    }
    // Another installer may have created storage after inspection. Recheck it
    // before deploy rather than adopting or overwriting that storage.
    await assertDatabaseCompatibility({ allowPending: true })
  }
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
