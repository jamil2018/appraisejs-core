#!/usr/bin/env tsx

/**
 * Combined sync script that orchestrates all entity sync scripts in the correct dependency order
 * Ensures database and filesystem parity by running all sync scripts sequentially
 * Continues execution even if individual scripts fail, providing a comprehensive summary at the end
 *
 * Usage: npx tsx scripts/sync-all.ts
 */

import { execa } from 'execa'
import { join } from 'path'
import {
  getSyncScriptDefinition,
  resolveRequestedSyncExecutionOrder,
  SYNC_ALL_REQUEST_ID,
  type SyncScriptId,
} from '../src/lib/sync/sync-registry'
const SYNC_SCRIPT_IDS = resolveRequestedSyncExecutionOrder(SYNC_ALL_REQUEST_ID)

interface DatabaseChanges {
  scanned: number
  existing: number
  created: number
  updated: number
  deleted: number
  errors: number
}

interface ScriptResult {
  name: string
  description: string
  success: boolean
  exitCode: number | null
  duration: number
  stdout: string
  stderr: string
  error?: Error
  dbChanges?: DatabaseChanges
}

interface SyncSummary {
  totalScripts: number
  successfulScripts: number
  failedScripts: number
  totalDuration: number
  results: ScriptResult[]
  totalDbChanges: DatabaseChanges
}

/**
 * Parses database changes from sync script output
 * Extracts counts from the "Sync Summary:" section
 */
function parseDatabaseChanges(stdout: string): DatabaseChanges | undefined {
  const changes: DatabaseChanges = {
    scanned: 0,
    existing: 0,
    created: 0,
    updated: 0,
    deleted: 0,
    errors: 0,
  }

  // Look for the Sync Summary section
  const summaryIndex = stdout.indexOf('📊 Sync Summary:')
  if (summaryIndex === -1) {
    return undefined
  }

  const summarySection = stdout.substring(summaryIndex)

  // Parse patterns like "   📁 Modules scanned: 3" or "   ✅ Modules existing: 3"
  const patterns = [
    { key: 'scanned' as const, regex: /scanned:\s*(\d+)/i },
    { key: 'existing' as const, regex: /existing:\s*(\d+)/i },
    { key: 'created' as const, regex: /created:\s*(\d+)/i },
    { key: 'updated' as const, regex: /updated:\s*(\d+)/i },
    { key: 'deleted' as const, regex: /deleted:\s*(\d+)/i },
    { key: 'errors' as const, regex: /Errors:\s*(\d+)/i },
  ]

  for (const pattern of patterns) {
    const match = summarySection.match(pattern.regex)
    if (match) {
      changes[pattern.key] = parseInt(match[1], 10) || 0
    }
  }

  return changes
}

/**
 * Executes a single sync script and captures the result
 */
async function executeSyncScript(scriptId: SyncScriptId): Promise<ScriptResult> {
  const definition = getSyncScriptDefinition(scriptId)
  const scriptPath = join(process.cwd(), 'scripts', definition.scriptFile)
  const startTime = Date.now()

  try {
    console.log(`\n🔄 Running ${scriptId}...`)
    const result = await execa(process.execPath, ['--import', 'tsx', scriptPath], {
      cwd: process.cwd(),
      stdio: 'pipe',
      reject: false, // Don't throw on non-zero exit codes
    })

    const duration = Date.now() - startTime
    const success = result.exitCode === 0
    const dbChanges = parseDatabaseChanges(result.stdout)

    if (success) {
      console.log(`   ✅ ${scriptId} completed successfully (${duration}ms)`)
    } else {
      console.log(`   ❌ ${scriptId} failed with exit code ${result.exitCode} (${duration}ms)`)
      if (result.stderr) {
        console.log(`   Error output: ${result.stderr.substring(0, 200)}...`)
      }
    }

    return {
      name: scriptId,
      description: definition.description,
      success,
      exitCode: result.exitCode ?? null,
      duration,
      stdout: result.stdout,
      stderr: result.stderr,
      dbChanges,
    }
  } catch (error) {
    const duration = Date.now() - startTime
    console.log(`   ❌ ${scriptId} threw an error (${duration}ms)`)
    console.error(`   Error: ${error}`)

    return {
      name: scriptId,
      description: definition.description,
      success: false,
      exitCode: null,
      duration,
      stdout: '',
      stderr: error instanceof Error ? error.message : String(error),
      error: error instanceof Error ? error : new Error(String(error)),
    }
  }
}

/**
 * Aggregates database changes across all scripts
 */
function aggregateDatabaseChanges(results: ScriptResult[]): DatabaseChanges {
  const total: DatabaseChanges = {
    scanned: 0,
    existing: 0,
    created: 0,
    updated: 0,
    deleted: 0,
    errors: 0,
  }

  for (const result of results) {
    if (result.dbChanges) {
      total.scanned += result.dbChanges.scanned
      total.existing += result.dbChanges.existing
      total.created += result.dbChanges.created
      total.updated += result.dbChanges.updated
      total.deleted += result.dbChanges.deleted
      total.errors += result.dbChanges.errors
    }
  }

  return total
}

/**
 * Generates and displays a comprehensive summary of the sync operation
 */
function displaySummary(summary: SyncSummary): void {
  console.log('\n' + '='.repeat(80))
  console.log('📊 SYNC ALL - EXECUTION SUMMARY')
  console.log('='.repeat(80))

  console.log(`\n📈 Overall Statistics:`)
  console.log(`   Total scripts: ${summary.totalScripts}`)
  console.log(`   ✅ Successful: ${summary.successfulScripts}`)
  console.log(`   ❌ Failed: ${summary.failedScripts}`)
  console.log(`   ⏱️  Total duration: ${(summary.totalDuration / 1000).toFixed(2)}s`)

  console.log(`\n📋 Execution Results:`)
  summary.results.forEach((result, index) => {
    const status = result.success ? '✅' : '❌'
    const duration = `${(result.duration / 1000).toFixed(2)}s`
    console.log(`   ${index + 1}. ${status} ${result.name} (${result.description}) - ${duration}`)
    
    if (!result.success) {
      if (result.exitCode !== null) {
        console.log(`      Exit code: ${result.exitCode}`)
      }
      if (result.stderr) {
        const errorPreview = result.stderr.split('\n').slice(0, 3).join(' | ')
        console.log(`      Error: ${errorPreview}`)
      }
    }
  })

  // Display database changes summary
  const hasChanges = summary.totalDbChanges.created > 0 || 
                     summary.totalDbChanges.updated > 0 || 
                     summary.totalDbChanges.deleted > 0 ||
                     summary.totalDbChanges.existing > 0 ||
                     summary.totalDbChanges.scanned > 0

  if (hasChanges) {
    console.log(`\n💾 Database Changes Summary:`)
    if (summary.totalDbChanges.scanned > 0) {
      console.log(`   📁 Total entities scanned: ${summary.totalDbChanges.scanned}`)
    }
    if (summary.totalDbChanges.existing > 0) {
      console.log(`   ✅ Total entities existing: ${summary.totalDbChanges.existing}`)
    }
    if (summary.totalDbChanges.created > 0) {
      console.log(`   ➕ Total entities created: ${summary.totalDbChanges.created}`)
    }
    if (summary.totalDbChanges.updated > 0) {
      console.log(`   🔄 Total entities updated: ${summary.totalDbChanges.updated}`)
    }
    if (summary.totalDbChanges.deleted > 0) {
      console.log(`   🗑️  Total entities deleted: ${summary.totalDbChanges.deleted}`)
    }
    if (summary.totalDbChanges.errors > 0) {
      console.log(`   ❌ Total errors encountered: ${summary.totalDbChanges.errors}`)
    }
  }

  console.log(`\n${'='.repeat(80)}`)

  if (summary.failedScripts === 0) {
    console.log('✅ All sync scripts completed successfully!')
    console.log('='.repeat(80) + '\n')
  } else {
    console.log(`⚠️  ${summary.failedScripts} script(s) failed. Please review the errors above.`)
    console.log('='.repeat(80) + '\n')
  }
}

/**
 * Main function that orchestrates all sync scripts
 */
async function main(): Promise<void> {
  const startTime = Date.now()
  const results: ScriptResult[] = []

  console.log('🚀 Starting combined sync operation...')
  console.log('This will sync all entities from filesystem to database in the correct dependency order.')
  console.log('Execution will continue even if individual scripts fail.\n')

  // Execute each script in order
  for (const scriptId of SYNC_SCRIPT_IDS) {
    const result = await executeSyncScript(scriptId)
    results.push(result)
    
    // Continue execution even if script failed (as per user requirement)
    // The script will log the failure but continue with remaining scripts
  }

  const totalDuration = Date.now() - startTime
  const successfulScripts = results.filter(r => r.success).length
  const failedScripts = results.filter(r => !r.success).length
  const totalDbChanges = aggregateDatabaseChanges(results)

  const summary: SyncSummary = {
    totalScripts: SYNC_SCRIPT_IDS.length,
    successfulScripts,
    failedScripts,
    totalDuration,
    results,
    totalDbChanges,
  }

  // Display comprehensive summary
  displaySummary(summary)

  // Exit with appropriate code
  if (failedScripts > 0) {
    process.exit(1)
  } else {
    process.exit(0)
  }
}

// Run the main function
main().catch(error => {
  console.error('\n❌ Fatal error during sync orchestration:', error)
  process.exit(1)
})
