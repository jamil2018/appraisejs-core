import { execFileSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

let migratedTestDatabasePromise: Promise<string> | undefined

async function migratedTestDatabase(): Promise<string> {
  migratedTestDatabasePromise ??= (async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-migrated-test-db-'))
    const databasePath = path.join(workspace, 'template.db')
    execFileSync(process.execPath, ['e2e/apply-migrations.mjs'], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: `file:${databasePath}` },
      stdio: 'pipe',
    })
    return databasePath
  })()
  return migratedTestDatabasePromise
}

export async function copyMigratedTestDatabase(databasePath: string): Promise<void> {
  await fs.copyFile(await migratedTestDatabase(), databasePath)
}
