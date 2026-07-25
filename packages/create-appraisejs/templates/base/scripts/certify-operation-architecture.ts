#!/usr/bin/env tsx

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  builtInStepDefinitions,
  stepDefinitionContentHash,
} from '../packages/cucumber-runtime/src/step-definitions/index'
import { defaultOperationRegistry } from '../src/lib/operation-catalog/default-operation-registry'
import { operationArchitectureDigest, runArchitectureScript } from './lib/operation-architecture-utils'

type CapabilityLedger = {
  ledgerHash: string
  sources: { stepDefinitionSourceHash: string; operationRegistryHash: string }
  summary: { builtInStepDefinitions: number; trustedHandlers: number; structuredOperationCases: number }
  rows: Array<{ reference: string; definitionHash: string; humanSignature: string; execution: { handler: string } }>
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ledgerPath = path.join(repoRoot, 'config', 'operation-capability-ledger.json')
const receiptPath = path.join(repoRoot, 'config', 'operation-architecture-certification.json')

export async function buildOperationArchitectureCertification() {
  const ledger = JSON.parse(await fs.readFile(ledgerPath, 'utf8')) as CapabilityLedger
  const expectedReferences = builtInStepDefinitions
    .map(definition => `${definition.identity.id}@${definition.identity.version}`)
    .sort()
  const actualReferences = ledger.rows.map(row => row.reference).sort()
  const allBuiltInsAccountedFor =
    expectedReferences.length === actualReferences.length &&
    expectedReferences.every((reference, index) => reference === actualReferences[index])
  const uniqueHumanSignatures = new Set(ledger.rows.map(row => row.humanSignature)).size === ledger.rows.length
  const exactDefinitionHashes = ledger.rows.every(row => {
    const definition = builtInStepDefinitions.find(
      item => `${item.identity.id}@${item.identity.version}` === row.reference,
    )
    return definition && stepDefinitionContentHash(definition) === row.definitionHash
  })
  const body = {
    schemaVersion: 2,
    status:
      allBuiltInsAccountedFor && uniqueHumanSignatures && exactDefinitionHashes
        ? ('certified' as const)
        : ('invalid' as const),
    hashes: {
      capabilityLedger: ledger.ledgerHash,
      stepDefinitionSource: stepDefinitionContentHash(builtInStepDefinitions),
      operationRegistry: defaultOperationRegistry.manifestHash,
    },
    counts: {
      builtInStepDefinitions: builtInStepDefinitions.length,
      trustedHandlers: ledger.summary.trustedHandlers,
      structuredOperationCases: ledger.summary.structuredOperationCases,
      humanSignatures: new Set(ledger.rows.map(row => row.humanSignature)).size,
    },
    gates: {
      canonicalSourceHashMatches:
        ledger.sources.stepDefinitionSourceHash === stepDefinitionContentHash(builtInStepDefinitions),
      allBuiltInsAccountedFor,
      exactDefinitionHashes,
      uniqueHumanSignatures,
      everyDefinitionHasTrustedHandler: ledger.rows.every(row => Boolean(row.execution.handler)),
    },
  }
  if (Object.values(body.gates).some(passed => !passed)) {
    throw new Error('Step Definition architecture invariant failed before certification.')
  }
  return { ...body, receiptHash: operationArchitectureDigest(body) }
}

async function main() {
  const receipt = await buildOperationArchitectureCertification()
  const rendered = `${JSON.stringify(receipt, null, 2)}\n`
  if (process.argv.includes('--check')) {
    const current = await fs.readFile(receiptPath, 'utf8').catch(() => '')
    if (current !== rendered) {
      throw new Error('Step Definition architecture certification is stale. Run npm run operation:certify.')
    }
  } else {
    await fs.writeFile(receiptPath, rendered)
  }
  console.log(`Step Definition architecture ${receipt.status} (${receipt.receiptHash}).`)
}

runArchitectureScript(import.meta.url, main)
