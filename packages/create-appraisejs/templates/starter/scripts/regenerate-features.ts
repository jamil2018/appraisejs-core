#!/usr/bin/env tsx

/**
 * Script to synchronize feature files between database and filesystem
 * This performs bidirectional sync - both DB->FS and FS->DB
 * Run this after merging changes or database migrations to ensure sync
 *
 * Usage: npx tsx scripts/regenerate-features.ts [--dry-run]
 */

import { performBidirectionalSync, performDryRunSync } from '../src/lib/bidirectional-sync'
import { ensureAutomationWorkspaceReady, getAutomationFeaturesDir } from '../src/lib/automation/paths'

/**
 * Runs bidirectional feature sync in dry-run or apply mode.
 */
async function main(): Promise<void> {
  try {
    const isDryRun = process.argv.includes('--dry-run')
    await ensureAutomationWorkspaceReady()
    const featuresBaseDir = getAutomationFeaturesDir()

    if (isDryRun) {
      console.log('🔍 Performing dry run of bidirectional sync...')
      console.log('This will show what would be changed without making any modifications.\n')

      const dryRunResult = await performDryRunSync(featuresBaseDir)

      console.log('\n📊 Dry run results:')
      console.log(`📁 Would generate ${dryRunResult.wouldGenerate.length} feature files:`)
      dryRunResult.wouldGenerate.forEach((filePath, index) => {
        const relativePath = filePath.replace(process.cwd(), '.')
        console.log(`   ${index + 1}. ${relativePath}`)
      })

      console.log(`\n🔄 Would update ${dryRunResult.wouldUpdate.length} feature files:`)
      dryRunResult.wouldUpdate.forEach((filePath, index) => {
        const relativePath = filePath.replace(process.cwd(), '.')
        console.log(`   ${index + 1}. ${relativePath}`)
      })

      console.log(`\n➕ Would create ${dryRunResult.wouldCreate.testSuites.length} test suites:`)
      dryRunResult.wouldCreate.testSuites.forEach((item, index) => {
        console.log(`   ${index + 1}. ${item}`)
      })

      console.log(`\n📝 Would create ${dryRunResult.wouldCreate.testCases.length} test cases:`)
      dryRunResult.wouldCreate.testCases.forEach((item, index) => {
        console.log(`   ${index + 1}. ${item}`)
      })

      console.log(`\n🔧 Would create ${dryRunResult.wouldCreate.templateSteps.length} template steps:`)
      dryRunResult.wouldCreate.templateSteps.forEach((item, index) => {
        console.log(`   ${index + 1}. ${item}`)
      })

      console.log(`\n🏷️  Would create ${dryRunResult.wouldCreate.tags.length} tags:`)
      dryRunResult.wouldCreate.tags.forEach((tag, index) => {
        console.log(`   ${index + 1}. ${tag}`)
      })

      console.log('\n💡 To perform the actual sync, run without --dry-run flag')
    } else {
      console.log('🔄 Starting bidirectional sync between database and feature files...')
      console.log('This will sync both directions:')
      console.log('   📁 Feature files → Database (create missing test suites/cases)')
      console.log('   🗄️ Database → Feature files (generate/update feature files)')
      console.log('')

      const syncResult = await performBidirectionalSync(featuresBaseDir)

      console.log('\n✅ Bidirectional sync completed successfully!')
      console.log(`📊 Summary:`)
      console.log(`   📁 Generated feature files: ${syncResult.generatedFeatureFiles}`)
      console.log(`   🔄 Updated feature files: ${syncResult.updatedFeatureFiles}`)
      console.log(`   🗄️ Merged test suites: ${syncResult.mergedTestSuites}`)
      console.log(`   📝 Added scenarios: ${syncResult.addedScenarios}`)
      console.log(`   📊 Total processed: ${syncResult.totalProcessed}`)

      if (syncResult.errors.length > 0) {
        console.log(`\n⚠️  Errors encountered: ${syncResult.errors.length}`)
        syncResult.errors.forEach((error, index) => {
          console.log(`   ${index + 1}. ${error}`)
        })
      }

      console.log('\n💡 Tips:')
      console.log('   - Run with --dry-run to see what would be changed')
      console.log('   - This script is safe to run multiple times')
      console.log('   - Changes are automatically merged, not overwritten')
    }
  } catch (error) {
    console.error('\n❌ Error during sync:', error)
    process.exit(1)
  }
}

main()
