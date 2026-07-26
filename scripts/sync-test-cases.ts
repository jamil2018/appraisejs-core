#!/usr/bin/env tsx

/**
 * Synchronize feature scenarios into authored test cases.
 *
 * Feature import is metadata-backed: every imported Gherkin step must carry an
 * exact ready Step Invocation in its Appraise metadata. The canonical database
 * synchronizer validates that contract and never infers a Step Definition from
 * display text.
 */

import { ensureAutomationWorkspaceReady, getAutomationFeaturesDir } from '../src/lib/automation/paths'
import { mergeScenariosWithExistingTestSuites } from '../src/lib/database-sync'
import { scanFeatureFiles } from '../src/lib/gherkin-parser'
import { runSyncScript } from './lib/sync-script-runner'

type SyncResult = {
  testCasesScanned: number
  testCasesCreated: number
  testCasesUpdated: number
  errors: string[]
}

async function main(): Promise<SyncResult> {
  await ensureAutomationWorkspaceReady()
  const featuresDir = getAutomationFeaturesDir()
  const features = await scanFeatureFiles(featuresDir)
  const synced = await mergeScenariosWithExistingTestSuites(features, featuresDir)

  return {
    testCasesScanned: features.reduce((total, feature) => total + feature.scenarios.length, 0),
    testCasesCreated: synced.addedScenarios,
    testCasesUpdated: synced.mergedTestSuites,
    errors: [],
  }
}

void runSyncScript(async () => {
  const result = await main()
  console.log('\n📊 Sync Summary:')
  console.log(`   Test cases scanned: ${result.testCasesScanned}`)
  console.log(`   Test cases created: ${result.testCasesCreated}`)
  console.log(`   Test cases updated: ${result.testCasesUpdated}`)
  return result
})
