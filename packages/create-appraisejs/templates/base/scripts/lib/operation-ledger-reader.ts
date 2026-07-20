import { promises as fs } from 'node:fs'
import path from 'node:path'

import { defaultOperationRegistry } from '../../src/lib/operation-catalog'

type LedgerRow = {
  canonicalOperation: string
  reviewState: string
  migrationState: string
  legacySteps: Array<{ slug: string; signature: string }>
}

export type TemplateStepOperationMapping = {
  operationId: string
  operationVersion: string
  operationDescriptorHash: string | null
  humanProjectionId: string
  operationMigrationState: string
}

export async function readTemplateStepOperationMappings(repoRoot: string) {
  const ledger = JSON.parse(
    await fs.readFile(path.join(repoRoot, 'config', 'operation-capability-ledger.json'), 'utf8'),
  ) as { rows: LedgerRow[] }
  const mappings = new Map<string, TemplateStepOperationMapping>()
  for (const row of ledger.rows) {
    if (row.reviewState !== 'approved' || row.legacySteps.length !== 1) continue
    const separator = row.canonicalOperation.lastIndexOf('@')
    const operationId = row.canonicalOperation.slice(0, separator)
    const operationVersion = row.canonicalOperation.slice(separator + 1)
    let descriptorHash: string | null = null
    try {
      descriptorHash = defaultOperationRegistry.read([{ id: operationId, version: operationVersion }])[0]!
        .descriptorHash
    } catch {
      // Ledger-first legacy operations receive a descriptor hash when their shared handler is extracted.
    }
    mappings.set(row.legacySteps[0]!.signature, {
      operationId,
      operationVersion,
      operationDescriptorHash: descriptorHash,
      humanProjectionId: `${operationId}.gherkin`,
      operationMigrationState: row.migrationState,
    })
  }
  return mappings
}
