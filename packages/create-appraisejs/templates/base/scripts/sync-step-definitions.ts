#!/usr/bin/env tsx

import { builtInStepDefinitions } from '../packages/cucumber-runtime/src/step-definitions/index.ts'
import prisma from '../src/config/db-config'
import { StepDefinitionRegistryService } from '../src/services/step-definition/step-definition-registry-service'
import { printSyncSummary } from './lib/sync-summary'

async function syncBuiltInDefinitions(registry: StepDefinitionRegistryService) {
  let created = 0
  let existing = 0

  for (const definition of builtInStepDefinitions) {
    const identity = { id: definition.identity.id, version: definition.identity.version }
    const present = await prisma.stepDefinition.findUnique({ where: { id_version: identity }, select: { id: true } })
    await registry.registerBuiltIn(definition, `builtin:${identity.id}@${identity.version}`)
    if (present) existing++
    else created++
  }

  return { created, existing }
}

async function main() {
  const registry = new StepDefinitionRegistryService(prisma)
  const { created, existing } = await syncBuiltInDefinitions(registry)

  printSyncSummary([
    { label: 'Step Definitions scanned', value: builtInStepDefinitions.length },
    { label: 'Step Definitions existing', value: existing },
    { label: 'Step Definitions created', value: created },
    { label: 'Errors', value: 0 },
  ])
}

main()
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => prisma.$disconnect())
