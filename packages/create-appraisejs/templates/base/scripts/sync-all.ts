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
import { printSyncSummary } from './lib/sync-summary'
const SYNC_SCRIPT_IDS = resolveRequestedSyncExecutionOrder(SYNC_ALL_REQUEST_ID)
const DIVIDER = '='.repeat(80)

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

const DB_CHANGE_PATTERNS: Array<{ key: keyof DatabaseChanges; regex: RegExp }> = [
  { key: 'scanned', regex: /scanned:\s*(\d+)/i },
  { key: 'existing', regex: /existing:\s*(\d+)/i },
  { key: 'created', regex: /created:\s*(\d+)/i },
  { key: 'updated', regex: /updated:\s*(\d+)/i },
  { key: 'deleted', regex: /deleted:\s*(\d+)/i },
  { key: 'errors', regex: /Errors:\s*(\d+)/i },
]

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

  // Child sync scripts are expected to print a canonical "📊 Sync Summary:"
  // block. If absent, we skip aggregation for that child.
  const summaryIndex = stdout.indexOf('📊 Sync Summary:')
  if (summaryIndex === -1) {
    return undefined
  }

  const summarySection = stdout.substring(summaryIndex)

  for (const pattern of DB_CHANGE_PATTERNS) {
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
    if (scriptId === 'sync-template-steps') {
      const projectionScriptPath = join(process.cwd(), 'scripts', 'generate-operation-projections.ts')
      const projectionResult = await execa(process.execPath, ['--import', 'tsx', projectionScriptPath], {
        cwd: process.cwd(),
        stdio: 'pipe',
        reject: false,
      })

      if (projectionResult.exitCode !== 0) {
        throw new Error(`Canonical operation projection failed: ${projectionResult.stderr || projectionResult.stdout}`)
      }
    }
    const result = await execa(process.execPath, ['--import', 'tsx', scriptPath], {
      cwd: process.cwd(),
      stdio: 'pipe',
      // Non-zero exit codes are reported in summary but should not stop orchestration.
      reject: false,
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
function hasDatabaseChanges(changes: DatabaseChanges): boolean {
  return Object.values(changes).some(value => value > 0)
}

function displaySummary(summary: SyncSummary): void {
  console.log('\n' + DIVIDER)
  console.log('📊 SYNC ALL - EXECUTION SUMMARY')
  console.log(DIVIDER)

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

  // Reuse shared summary rendering so aggregate output format remains
  // structurally aligned with individual sync scripts.
  if (hasDatabaseChanges(summary.totalDbChanges)) {
    printSyncSummary([
      { label: '📁 Total entities scanned', value: summary.totalDbChanges.scanned },
      { label: '✅ Total entities existing', value: summary.totalDbChanges.existing },
      { label: '➕ Total entities created', value: summary.totalDbChanges.created },
      { label: '🔄 Total entities updated', value: summary.totalDbChanges.updated },
      { label: '🗑️  Total entities deleted', value: summary.totalDbChanges.deleted },
      { label: '❌ Total errors encountered', value: summary.totalDbChanges.errors },
    ])
  }

  console.log(`\n${DIVIDER}`)

  if (summary.failedScripts === 0) {
    console.log('✅ All sync scripts completed successfully!')
    console.log(DIVIDER + '\n')
  } else {
    console.log(`⚠️  ${summary.failedScripts} script(s) failed. Please review the errors above.`)
    console.log(DIVIDER + '\n')
  }
}

/**
 * Main function that orchestrates all sync scripts
 */
async function main(): Promise<number> {
  const startTime = Date.now()
  const results: ScriptResult[] = []

  console.log('🚀 Starting combined sync operation...')
  console.log('This will sync all entities from filesystem to database in the correct dependency order.')
  console.log('Execution will continue even if individual scripts fail.\n')

  // Execute in dependency order from registry; we intentionally continue through
  // failures to provide complete visibility of system state in one run.
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

  return failedScripts > 0 ? 1 : 0
}

// Run the main function
main()
  .catch(error => {
    console.error('\n❌ Fatal error during sync orchestration:', error)
    return 1
  })
  .then(exitCode => {
    process.exit(exitCode)
  })
