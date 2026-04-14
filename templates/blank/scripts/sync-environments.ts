#!/usr/bin/env tsx

/**
 * Script to synchronize environments from filesystem to database
 * Scans environments.json file to ensure all environments exist in DB
 * Run this after merging changes to ensure environment sync
 *
 * Usage: npx tsx scripts/sync-environments.ts
 */

import { promises as fs } from 'fs'
import path from 'path'
import prisma from '../src/config/db-config'
import { ensureAutomationWorkspaceReady, getAutomationEnvironmentsDir } from '../src/lib/automation/paths'
import { printSyncSummary } from './lib/sync-summary'
import { runSyncScript } from './lib/sync-script-runner'

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

const EMPTY_ENVIRONMENTS_FILE_CONTENT = '{}\n'

/**
 * Reads and parses the environments.json file
 */
async function readEnvironmentsFromFile(): Promise<Record<string, EnvironmentConfig>> {
  const filePath = path.join(getAutomationEnvironmentsDir(), 'environments.json')

  try {
    await fs.access(filePath)
  } catch {
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, EMPTY_ENVIRONMENTS_FILE_CONTENT, 'utf-8')
    return {}
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

function normalizeEnvironmentName(name: string): string {
  if (!name || name.trim() === '') {
    return name
  }

  return name
    .trim()
    .replace(/[_\s]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(segment => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join(' ')
}

function getEnvironmentIdentityKey(name: string): string {
  return name
    .trim()
    .replace(/[_\s]+/g, ' ')
    .toLowerCase()
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
  const jsonEnvironmentNamesNormalized = new Set(environments.map(env => getEnvironmentIdentityKey(env.name)))

  // Get all environments from database
  const allDbEnvironments = await prisma.environment.findMany({
    select: { id: true, name: true, baseUrl: true, apiBaseUrl: true, username: true, password: true },
  })

  // Create a case-insensitive map: normalized name -> actual DB name
  const dbEnvironmentsByNormalizedName = new Map<
    string,
    { id: string; name: string; baseUrl: string; apiBaseUrl: string | null; username: string | null; password: string | null }
  >()
  for (const dbEnv of allDbEnvironments) {
    const normalizedName = getEnvironmentIdentityKey(dbEnv.name)
    // If we find a duplicate normalized name, keep the first one
    if (!dbEnvironmentsByNormalizedName.has(normalizedName)) {
      dbEnvironmentsByNormalizedName.set(normalizedName, dbEnv)
    }
  }

  // Delete environments from DB that are not in JSON file (case-insensitive comparison)
  for (const dbEnv of allDbEnvironments) {
    const normalizedDbName = getEnvironmentIdentityKey(dbEnv.name)
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
      const normalizedName = getEnvironmentIdentityKey(env.name)
      // Check if environment already exists by normalized name (case-insensitive)
      const existingDbEnv = dbEnvironmentsByNormalizedName.get(normalizedName)

      if (existingDbEnv) {
        const needsUpdate =
          existingDbEnv.baseUrl !== env.baseUrl ||
          (existingDbEnv.apiBaseUrl ?? null) !== env.apiBaseUrl ||
          (existingDbEnv.username ?? null) !== env.username ||
          (existingDbEnv.password ?? null) !== env.password

        if (needsUpdate) {
          await prisma.environment.update({
            where: { id: existingDbEnv.id },
            data: {
              baseUrl: env.baseUrl,
              apiBaseUrl: env.apiBaseUrl,
              username: env.username,
              password: env.password,
            },
          })
          console.log(`   🔄 Updated environment '${existingDbEnv.name}'`)
        }
        result.environmentsExisting++
        result.existingEnvironments.push(existingDbEnv.name)
        console.log(`   ✓ Environment '${existingDbEnv.name}' already exists`)
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
async function main(): Promise<SyncResult> {
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

    printSyncSummary(
      [
        { label: '📁 Environments scanned', value: result.environmentsScanned },
        { label: '✅ Environments existing', value: result.environmentsExisting },
        { label: '➕ Environments created', value: result.environmentsCreated },
        { label: '🗑️  Environments deleted', value: result.environmentsDeleted },
        { label: '⚠️  Environments skipped', value: result.environmentsSkipped },
        { label: '❌ Errors', value: result.errors.length },
      ],
      [
        { title: 'Created environments', items: result.createdEnvironments },
        { title: 'Existing environments', items: result.existingEnvironments },
        { title: 'Deleted environments', items: result.deletedEnvironments },
        { title: 'Skipped environments (have test runs)', items: result.skippedEnvironments },
        { title: 'Errors', items: result.errors },
      ],
    )
    return result
}

runSyncScript(main)


