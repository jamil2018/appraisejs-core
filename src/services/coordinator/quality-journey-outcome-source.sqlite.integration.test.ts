import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import {
  assertCommittedProviderSourceReplay,
  assertProviderReceiptCanonicalIdentity,
  providerReconciliationRequestHash,
} from '@/lib/quality-journey/provider-reconciliation-contract'
import {
  createServiceMatrix,
  serviceCases,
} from '../../../scripts/test-harness/m06/service-custody/custody-service-matrix'
const matrix = createServiceMatrix(expect, serviceCases, {
  canonicalContractJson,
  assertCommittedProviderSourceReplay,
  assertProviderReceiptCanonicalIdentity,
  providerReconciliationRequestHash,
})
beforeAll(() => matrix.initializeManifest())
afterAll(() => matrix.releaseAfterFinalAssertions())
describe('original sole-Prisma custody in ordinary offline owner processes', () => {
  for (const name of serviceCases) it(name, () => matrix.runSelectedCase(name), 70000)
})
