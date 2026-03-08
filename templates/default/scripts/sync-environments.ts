#!/usr/bin/env tsx

/**
 * Script to synchronize environments from filesystem to database
 * Scans environments.json file to ensure all environments exist in DB
 * Run this after merging changes to ensure environment sync
 *
 * Usage: npx tsx scripts/sync-environments.ts
 */

import { promises as fs } from 'fs'
import prisma from '../src/config/db-config'
import { ensureAutomationWorkspaceReady, getAutomationEnvironmentsDir } from '../src/lib/automation/paths'

interface EnvironmentConfig {
  baseUrl: string
  apiBaseUrl: string
  email: string
  password: string
}

interface EnvironmentData {
  name: string
  baseUrl: string
  apiBaseUrl: string | null
  username: string | null
  password: string | null
}

interface SyncResult {
  environmentsScanned: number
  environmentsExisting: number
  environmentsCreated: number
  environmentsDeleted: number
  environmentsSkipped: number
  errors: string[]
  createdEnvironments: string[]
  existingEnvironments: string[]
  deletedEnvironments: string[]
  skippedEnvironments: string[]
}

/**
 * Reads and parses the environments.json file
 */
async function readEnvironmentsFromFile(): Promise<Record<string, EnvironmentConfig>> {
  const filePath = `${getAutomationEnvironmentsDir()}/environments.json`

  try {
    await fs.access(filePath)
  } catch {
    throw new Error(`Environments file not found at ${filePath}`)
  }

  try {
    const fileContent = await fs.readFile(filePath, 'utf-8')
    const jsonContent = JSON.parse(fileContent) as Record<string, EnvironmentConfig>

    if (!jsonContent || typeof jsonContent !== 'object') {
      throw new Error('Invalid JSON structure: expected an object')
    }

    return jsonContent
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in environments file: ${error.message}`)
    }
    throw error
  }
}

/**
 * Normalizes environment name to title case for consistent comparison
 * e.g., "staging" -> "Staging", "STAGING" -> "Staging", "Staging" -> "Staging"
 */
function normalizeEnvironmentName(name: string): string {
  if (!name || name.trim() === '') {
    return name
  }
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()
}

/**
 * Builds Environment objects from JSON content
 * Maps JSON structure to Prisma Environment model
 */
function buildEnvironmentObjects(
  jsonContent: Record<string, EnvironmentConfig>,
): EnvironmentData[] {
  const environments: EnvironmentData[] = []

  for (const [key, config] of Object.entries(jsonContent)) {
    // Normalize the environment name to title case for consistency
    const name = normalizeEnvironmentName(key)

    // Map email to username
    const username = config.email && config.email.trim() !== '' ? config.email.trim() : null

    // Convert empty strings to null for optional fields
    const apiBaseUrl = config.apiBaseUrl && config.apiBaseUrl.trim() !== '' ? config.apiBaseUrl.trim() : null
    const password = config.password && config.password.trim() !== '' ? config.password.trim() : null

    // Validate required fields
    if (!config.baseUrl || config.baseUrl.trim() === '') {
      throw new Error(`Environment '${name}' is missing required field 'baseUrl'`)
    }

    environments.push({
      name,
      baseUrl: config.baseUrl.trim(),
      apiBaseUrl,
      username,
      password,
    })
  }

  return environments
}

/**
 * Syncs environments to database
 */
async function syncEnvironmentsToDatabase(environments: EnvironmentData[]): Promise<SyncResult> {
  const result: SyncResult = {
    environmentsScanned: environments.length,
    environmentsExisting: 0,
    environmentsCreated: 0,
    environmentsDeleted: 0,
    environmentsSkipped: 0,
    errors: [],
    createdEnvironments: [],
    existingEnvironments: [],
    deletedEnvironments: [],
    skippedEnvironments: [],
  }

  // Get set of normalized environment names from JSON file (for case-insensitive comparison)
  const jsonEnvironmentNamesNormalized = new Set(
    environments.map(env => normalizeEnvironmentName(env.name))
  )

  // Get all environments from database
  const allDbEnvironments = await prisma.environment.findMany({
    select: { id: true, name: true },
  })

  // Create a case-insensitive map: normalized name -> actual DB name
  const dbEnvironmentsByNormalizedName = new Map<string, { id: string; name: string }>()
  for (const dbEnv of allDbEnvironments) {
    const normalizedName = normalizeEnvironmentName(dbEnv.name)
    // If we find a duplicate normalized name, keep the first one
    if (!dbEnvironmentsByNormalizedName.has(normalizedName)) {
      dbEnvironmentsByNormalizedName.set(normalizedName, dbEnv)
    }
  }

  // Delete environments from DB that are not in JSON file (case-insensitive comparison)
  for (const dbEnv of allDbEnvironments) {
    const normalizedDbName = normalizeEnvironmentName(dbEnv.name)
    if (!jsonEnvironmentNamesNormalized.has(normalizedDbName)) {
      try {
        // Check if environment has test runs (foreign key constraint prevents deletion)
        const testRunCount = await prisma.testRun.count({
          where: { environmentId: dbEnv.id },
        })

        if (testRunCount > 0) {
          result.environmentsSkipped++
          result.skippedEnvironments.push(dbEnv.name)
          console.log(`   ⚠️  Skipped deletion of '${dbEnv.name}' (has ${testRunCount} test run(s))`)
        } else {
          await prisma.environment.delete({
            where: { name: dbEnv.name },
          })
          result.environmentsDeleted++
          result.deletedEnvironments.push(dbEnv.name)
          console.log(`   🗑️  Deleted environment '${dbEnv.name}' (not in JSON file)`)
        }
      } catch (error) {
        const errorMsg = `Error deleting environment '${dbEnv.name}': ${error}`
        result.errors.push(errorMsg)
        console.error(`   ❌ ${errorMsg}`)
      }
    }
  }

  // Create or update environments from JSON file
  for (const env of environments) {
    try {
      const normalizedName = normalizeEnvironmentName(env.name)
      // Check if environment already exists by normalized name (case-insensitive)
      const existingDbEnv = dbEnvironmentsByNormalizedName.get(normalizedName)

      if (existingDbEnv) {
        // Environment exists, check if name needs to be updated to normalized form
        if (existingDbEnv.name !== env.name) {
          // Update the name to normalized form
          await prisma.environment.update({
            where: { id: existingDbEnv.id },
            data: { name: env.name },
          })
          console.log(`   🔄 Updated environment name from '${existingDbEnv.name}' to '${env.name}'`)
        }
        result.environmentsExisting++
        result.existingEnvironments.push(env.name)
        console.log(`   ✓ Environment '${env.name}' already exists`)
      } else {
        // Create the environment
        await prisma.environment.create({
          data: {
            name: env.name,
            baseUrl: env.baseUrl,
            apiBaseUrl: env.apiBaseUrl,
            username: env.username,
            password: env.password,
          },
        })
        result.environmentsCreated++
        result.createdEnvironments.push(env.name)
        console.log(`   ➕ Created environment '${env.name}'`)
      }
    } catch (error) {
      const errorMsg = `Error syncing environment '${env.name}': ${error}`
      result.errors.push(errorMsg)
      console.error(`   ❌ ${errorMsg}`)
    }
  }

  return result
}

/**
 * Generates and displays sync summary
 */
function generateSummary(result: SyncResult): void {
  console.log('\n📊 Sync Summary:')
  console.log(`   📁 Environments scanned: ${result.environmentsScanned}`)
  console.log(`   ✅ Environments existing: ${result.environmentsExisting}`)
  console.log(`   ➕ Environments created: ${result.environmentsCreated}`)
  console.log(`   🗑️  Environments deleted: ${result.environmentsDeleted}`)
  console.log(`   ⚠️  Environments skipped: ${result.environmentsSkipped}`)
  console.log(`   ❌ Errors: ${result.errors.length}`)

  if (result.createdEnvironments.length > 0) {
    console.log('\n   Created environments:')
    result.createdEnvironments.forEach((name, index) => {
      console.log(`      ${index + 1}. ${name}`)
    })
  }

  if (result.existingEnvironments.length > 0) {
    console.log('\n   Existing environments:')
    result.existingEnvironments.forEach((name, index) => {
      console.log(`      ${index + 1}. ${name}`)
    })
  }

  if (result.deletedEnvironments.length > 0) {
    console.log('\n   Deleted environments:')
    result.deletedEnvironments.forEach((name, index) => {
      console.log(`      ${index + 1}. ${name}`)
    })
  }

  if (result.skippedEnvironments.length > 0) {
    console.log('\n   Skipped environments (have test runs):')
    result.skippedEnvironments.forEach((name, index) => {
      console.log(`      ${index + 1}. ${name}`)
    })
  }

  if (result.errors.length > 0) {
    console.log('\n   Errors:')
    result.errors.forEach((error, index) => {
      console.log(`      ${index + 1}. ${error}`)
    })
  }
}

/**
 * Main function
 */
async function main() {
  try {
    console.log('🔄 Starting environments sync...')
    console.log('This will scan environments.json and sync environments to database.\n')

    await ensureAutomationWorkspaceReady()

    // Read environments from file
    console.log('📁 Reading environments.json...')
    const jsonContent = await readEnvironmentsFromFile()
    const environmentKeys = Object.keys(jsonContent)
    console.log(`   Found ${environmentKeys.length} environment(s): ${environmentKeys.join(', ') || 'none'}`)

    // Build environment objects
    console.log('\n🔍 Building environment objects...')
    const environments = buildEnvironmentObjects(jsonContent)
    console.log(`   Built ${environments.length} environment object(s)`)

    // Sync to database
    console.log('\n✅ Syncing environments to database...')
    const result = await syncEnvironmentsToDatabase(environments)

    // Generate summary
    generateSummary(result)

    if (result.errors.length === 0) {
      console.log('\n✅ Sync completed successfully!')
    } else {
      console.log('\n⚠️  Sync completed with errors. Please review the errors above.')
      process.exit(1)
    }
  } catch (error) {
    console.error('\n❌ Error during sync:', error)
    process.exit(1)
  } finally {
    await prisma.$disconnect()
  }
}

main()




