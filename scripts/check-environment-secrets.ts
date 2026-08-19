#!/usr/bin/env tsx

import { execFileSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { environmentJsonFailures, environmentSchemaFailures } from './lib/environment-secret-policy'

const repoRoot = process.cwd()

async function read(relativePath: string): Promise<string> {
  return fs.readFile(path.join(repoRoot, relativePath), 'utf8')
}

async function readOptional(relativePath: string): Promise<string | null> {
  try {
    return await read(relativePath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

function report(failures: string[]): void {
  const failed = failures.length > 0
  const output = failed
    ? ['Environment secret-reference check failed:', ...failures.map(failure => `- ${failure}`)].join('\n')
    : 'Environment secret-reference check passed: no value column, legacy row, or projected secret field.'
  console[failed ? 'error' : 'log'](output)
  process.exitCode = Number(failed)
}

async function main(): Promise<void> {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'appraise-secret-check-'))
  const databasePath = path.join(workspace, 'release-check.db')
  try {
    execFileSync(process.execPath, ['e2e/apply-migrations.mjs'], {
      cwd: repoRoot,
      env: { ...process.env, DATABASE_URL: `file:${databasePath}` },
      stdio: 'pipe',
    })
    process.env.DATABASE_URL = `file:${databasePath}`
    const { PrismaClient } = await import('@prisma/client')
    const database = new PrismaClient()
    let columns: Array<{ name: string }>
    try {
      columns = await database.$queryRawUnsafe<Array<{ name: string }>>('PRAGMA table_info("Environment")')
    } finally {
      await database.$disconnect()
    }

    const schema = await read('prisma/schema.prisma')
    const jsonPaths = [
      'automation/config/environments/environments.json',
      'src/tests/config/environments/environments.json',
      'packages/create-appraisejs/templates/base/automation/config/environments/environments.json',
      'packages/create-appraisejs/templates/base/src/tests/config/environments/environments.json',
    ]
    const jsonContents = await Promise.all(jsonPaths.map(readOptional))
    const jsonFailures = jsonPaths.flatMap((relativePath, index) =>
      jsonContents[index] === null ? [] : environmentJsonFailures(relativePath, jsonContents[index]),
    )
    report([...environmentSchemaFailures(columns, schema), ...jsonFailures])
  } finally {
    await fs.rm(workspace, { recursive: true, force: true })
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
