#!/usr/bin/env tsx

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { listBrowserOperationHandlerRefs } from '../packages/cucumber-runtime/src/operations/index'
import {
  builtInStepDefinitions,
  stepDefinitionContentHash,
} from '../packages/cucumber-runtime/src/step-definitions/index'
import { defaultOperationRegistry } from '../src/lib/operation-catalog/default-operation-registry'
import { operationArchitectureDigest, runArchitectureScript } from './lib/operation-architecture-utils'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outputPath = path.join(repoRoot, 'config', 'operation-capability-ledger.json')

function operationExecution(definition: (typeof builtInStepDefinitions)[number]) {
  if (definition.execution.kind !== 'operation') {
    throw new Error(`Built-in ${definition.identity.id}@${definition.identity.version} must bind an operation handler.`)
  }
  return definition.execution
}

export function buildOperationCapabilityLedger() {
  const handlers = new Set(listBrowserOperationHandlerRefs())
  const rows = builtInStepDefinitions
    .map(definition => {
      const execution = operationExecution(definition)
      const handler = `${execution.handlerId}@${execution.handlerVersion}`
      if (!handlers.has(handler)) {
        throw new Error(
          `Step Definition ${definition.identity.id}@${definition.identity.version} has no trusted handler.`,
        )
      }
      return {
        reference: `${definition.identity.id}@${definition.identity.version}`,
        definitionHash: stepDefinitionContentHash(definition),
        humanSignature: definition.human.signature,
        execution: {
          kind: execution.kind,
          handler,
          runtime: execution.runtime,
        },
      }
    })
    .sort((left, right) => left.reference.localeCompare(right.reference))

  const content = {
    schemaVersion: 3,
    summary: {
      builtInStepDefinitions: rows.length,
      trustedHandlers: handlers.size,
      structuredOperationCases: builtInStepDefinitions.filter(
        definition =>
          definition.execution.kind === 'operation' && definition.execution.handlerId.includes('structured'),
      ).length,
    },
    sources: {
      stepDefinitionSourceHash: stepDefinitionContentHash(builtInStepDefinitions),
      operationRegistryHash: defaultOperationRegistry.manifestHash,
    },
    rows,
  }
  return { ...content, ledgerHash: operationArchitectureDigest(content) }
}

async function main() {
  const ledger = buildOperationCapabilityLedger()
  const rendered = `${JSON.stringify(ledger, null, 2)}\n`
  if (process.argv.includes('--check')) {
    const current = await fs.readFile(outputPath, 'utf8').catch(() => '')
    if (current !== rendered)
      throw new Error('Step Definition capability ledger is stale. Run npm run operation:ledger.')
    console.log(`Step Definition capability ledger is current (${ledger.ledgerHash}).`)
    return
  }
  await fs.writeFile(outputPath, rendered)
  console.log(`Wrote Step Definition capability ledger (${ledger.ledgerHash}).`)
}

runArchitectureScript(import.meta.url, main)
