#!/usr/bin/env tsx

import { promises as fs } from 'node:fs'
import path from 'node:path'

import prisma from '../src/config/db-config'
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
  const columns = await prisma.$queryRawUnsafe<Array<{ name: string }>>('PRAGMA table_info("Environment")')
  const legacyRows = await prisma.environment.count({ where: { credentialState: 'LEGACY_DISABLED' } })
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
  report([...environmentSchemaFailures(columns, legacyRows, schema), ...jsonFailures])
}

main()
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => prisma.$disconnect())
