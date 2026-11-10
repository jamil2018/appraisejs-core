import { serviceControllerResult } from './custody-service-controller-result.ts'
// Fresh direct OS main entry. Execution requires exact artifact and operations acceptance.
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import {
  assertCommittedProviderSourceReplay,
  assertProviderReceiptCanonicalIdentity,
  providerReconciliationRequestHash,
} from '@/lib/quality-journey/provider-reconciliation-contract'
import { createServiceMatrix, freshRemainingServiceCases } from './custody-service-matrix.ts'
import { createServiceMatrixExpect } from './custody-service-expect.ts'
import { awaitServiceParentIdentity } from './custody-service-parent-identity.ts'

export function runServiceController(selected = freshRemainingServiceCases) {
  const matrix = createServiceMatrix(createServiceMatrixExpect(), selected, {
    canonicalContractJson,
    assertCommittedProviderSourceReplay,
    assertProviderReceiptCanonicalIdentity,
    providerReconciliationRequestHash,
  })
  /** @param {unknown} error */
  function retainMainFailure(error) {
    matrix.fail(error)
    try {
      const root = path.dirname(process.env.CUSTODY_SERVICE_EVIDENCE ?? '')
      writeFileSync(
        path.join(root, 'supervisor-failure.json'),
        JSON.stringify(
          {
            version: 1,
            type: 'service-main-controller-failure',
            pid: process.pid,
            classification: 'UNKNOWN_ORIGINAL_OS_PARENT_AND_RESOURCES_RETAINED',
            message: String(matrix.diagnostics().firstError),
          },
          null,
          2,
        ) + '\n',
        { flag: 'wx' },
      )
    } catch (reportError) {
      matrix.diagnostics().reportError = reportError
    }
    // Referenced original registry interval remains. No exitCode, exit, detach or cleanup.
  }
  process.on('uncaughtException', retainMainFailure)
  process.on('unhandledRejection', retainMainFailure)
  async function main() {
    assert.equal(process.argv.length, 2)
    const evidence = process.env.CUSTODY_SERVICE_EVIDENCE
    assert.ok(evidence && path.isAbsolute(evidence))
    const filename = process.env.CUSTODY_SERVICE_PARENT_IDENTITY
    assert.ok(filename)
    assert.equal(filename, path.join(path.dirname(evidence), 'supervisor-identity.json'))
    await awaitServiceParentIdentity(matrix.diagnostics(), filename, {
      pid: process.pid,
      executable: process.execPath,
      argv: [process.execPath, process.argv[1]],
      cwd: process.cwd(),
      identityFilename: filename,
    })
    matrix.initializeManifest()
    for (const name of selected) await matrix.runSelectedCase(name)
    const registry = matrix.diagnostics()
    writeFileSync(
      path.join(path.dirname(evidence), 'supervisor-result.json'),
      JSON.stringify(serviceControllerResult(registry, process.pid, selected), null, 2) + '\n',
      { flag: 'wx' },
    )
    matrix.releaseAfterFinalAssertions() // Last action: all exact current failure checks precede registry release.
  }
  void main().catch(retainMainFailure)
}
