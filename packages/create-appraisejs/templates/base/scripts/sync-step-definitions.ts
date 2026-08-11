#!/usr/bin/env tsx

import prisma from '../src/config/db-config'
import { ensureBuiltInStepDefinitionReadiness } from '../src/services/step-definition/built-in-readiness-service'
import { printSyncSummary } from './lib/sync-summary'

async function main() {
  const receipt = await ensureBuiltInStepDefinitionReadiness(prisma)

  printSyncSummary([
    { label: 'Step Definitions seeded', value: receipt.seeded },
    { label: 'Step Definitions repaired', value: receipt.repaired },
    { label: 'Step Definitions unchanged', value: receipt.unchanged },
    { label: 'Errors', value: receipt.conflicting },
  ])
}

main()
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => prisma.$disconnect())
