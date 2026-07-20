#!/usr/bin/env tsx

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defaultOperationRegistry } from '../src/lib/operation-catalog/default-operation-registry'
import {
  operationArchitectureDigest,
  readAllOperationDescriptors,
  runArchitectureScript,
} from './lib/operation-architecture-utils'

type LedgerRow = {
  canonicalOperation: string
  migrationState: string
  legacySteps: unknown[]
  managedActions: unknown[]
  humanAuthoring: string
  agentAuthoring: string
  capsuleExecution: string
}

type CapabilityLedger = {
  ledgerHash: string
  summary: {
    legacyTemplateSteps: number
    managedActions: number
    capsuleDelegatedHandlers: number
  }
  rows: LedgerRow[]
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ledgerPath = path.join(repoRoot, 'config', 'operation-capability-ledger.json')
const receiptPath = path.join(repoRoot, 'config', 'operation-architecture-certification.json')

export async function buildOperationArchitectureCertification() {
  const ledger = JSON.parse(await fs.readFile(ledgerPath, 'utf8')) as CapabilityLedger
  const definitions = readAllOperationDescriptors()
  const migrationStates = Object.fromEntries(
    [...new Set(ledger.rows.map(row => row.migrationState))]
      .sort()
      .map(state => [state, ledger.rows.filter(row => row.migrationState === state).length]),
  )
  const pendingRows = ledger.rows.filter(row => row.migrationState !== 'mapped')
  const activeRegistryComplete = definitions.every(
    definition =>
      definition.handler.contentHash &&
      definition.humanSurface.status === 'supported' &&
      definition.humanProjections.length > 0 &&
      definition.agentSurface.status === 'supported' &&
      definition.agentProjection,
  )
  const fullLegacyCoverage = pendingRows.length === 0
  const body = {
    schemaVersion: 1,
    status: fullLegacyCoverage ? ('certified' as const) : ('migration-in-progress' as const),
    hashes: {
      capabilityLedger: ledger.ledgerHash,
      operationRegistry: defaultOperationRegistry.manifestHash,
    },
    counts: {
      ledgerRows: ledger.rows.length,
      legacyTemplateSteps: ledger.summary.legacyTemplateSteps,
      legacyRowsMapped: ledger.rows.filter(row => row.legacySteps.length > 0 && row.migrationState === 'mapped').length,
      managedActions: ledger.summary.managedActions,
      activeOperations: definitions.length,
      trustedHandlers: new Set(definitions.map(definition => definition.handler.id)).size,
      humanProjections: definitions.reduce((count, definition) => count + definition.humanProjections.length, 0),
      agentProjections: definitions.filter(definition => definition.agentSurface.status === 'supported').length,
      aliases: definitions.reduce((count, definition) => count + definition.aliases.length, 0),
      surfaceExceptions: definitions.filter(
        definition => definition.humanSurface.status === 'exception' || definition.agentSurface.status === 'exception',
      ).length,
      pendingMigrationRows: pendingRows.length,
      parityCases: ledger.rows.filter(
        row => row.migrationState === 'mapped' && row.humanAuthoring === 'native' && row.agentAuthoring === 'native',
      ).length,
    },
    migrationStates,
    gates: {
      ledgerAccountsForEveryLegacyStep:
        ledger.rows.reduce((count, row) => count + row.legacySteps.length, 0) === ledger.summary.legacyTemplateSteps,
      ledgerAccountsForEveryManagedAction:
        ledger.rows.reduce((count, row) => count + row.managedActions.length, 0) === ledger.summary.managedActions,
      managedHandlersDelegated: ledger.summary.capsuleDelegatedHandlers === definitions.length,
      activeRegistryComplete,
      fullLegacyCoverage,
    },
  }
  if (Object.entries(body.gates).some(([gate, passed]) => gate !== 'fullLegacyCoverage' && !passed))
    throw new Error('Operation architecture invariant failed before certification.')
  return { ...body, receiptHash: operationArchitectureDigest(body) }
}

async function main() {
  const receipt = await buildOperationArchitectureCertification()
  const rendered = `${JSON.stringify(receipt, null, 2)}\n`
  if (process.argv.includes('--check')) {
    const current = await fs.readFile(receiptPath, 'utf8').catch(() => '')
    if (current !== rendered)
      throw new Error('Operation architecture certification is stale. Run npm run operation:certify.')
  } else {
    await fs.writeFile(receiptPath, rendered)
  }
  if (process.argv.includes('--require-complete') && !receipt.gates.fullLegacyCoverage)
    throw new Error(
      `Operation migration is not cutover-ready: ${receipt.counts.pendingMigrationRows} ledger rows remain.`,
    )
  console.log(`Operation architecture ${receipt.status} (${receipt.receiptHash}).`)
}

runArchitectureScript(import.meta.url, main)
