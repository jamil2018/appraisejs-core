#!/usr/bin/env tsx

/**
 * Script to synchronize template step groups from filesystem to database
 * Scans step definition files to ensure all step groups exist in DB
 * Filesystem is the source of truth - groups in DB but not in FS will be deleted
 * Run this after merging changes to ensure step group sync
 *
 * Usage: npx tsx scripts/template-step-group-sync.ts
 */

import { promises as fs } from 'fs'
import { join } from 'path'
import { glob } from 'glob'
import prisma from '../src/config/db-config'
import { TemplateStepGroupType } from '@prisma/client'

interface StepGroupJSDoc {
  name: string
  description: string | null
  type: TemplateStepGroupType
}

interface StepGroupData {
  name: string
  description: string | null
  type: TemplateStepGroupType
}

interface SyncResult {
  groupsScanned: number
  groupsExisting: number
  groupsCreated: number
  groupsDeleted: number
  groupsSkipped: number
  groupsSkippedNoJSDoc: number
  errors: string[]
  createdGroups: string[]
  existingGroups: string[]
  deletedGroups: string[]
  skippedGroups: string[]
  skippedNoJSDocFiles: string[]
}

/**
 * Parses JSDoc comment to extract step group metadata
 * Returns null if no valid group JSDoc is found
 */
function parseGroupJSDoc(content: string): StepGroupJSDoc | null {
  const lines = content.split('\n')

  // Look for JSDoc comment at the very top of the file
  if (lines.length === 0) {
    return null
  }

  const firstLine = lines[0].trim()
  if (!firstLine.startsWith('/**')) {
    return null
  }

  // Check if this JSDoc contains group metadata (@type distinguishes group from step JSDoc)
  let hasType = false
  let endLine = -1
  let name: string | null = null
  let description: string | null = null
  let type: string | null = null

  // Look through the JSDoc block until we find the closing */
  // Use a reasonable limit (50 lines) to avoid parsing entire files if JSDoc is malformed
  const maxLines = Math.min(lines.length, 50)
  for (let i = 0; i < maxLines; i++) {
    const line = lines[i].trim()

    // Check if this line contains the closing */ (could be on same line as content)
    if (line.includes('*/')) {
      // Found end of JSDoc - extract content before */
      const beforeClose = line.split('*/')[0].trim()

      // Process the content before */ if it contains JSDoc tags
      // Since we already split by */, beforeClose doesn't contain it anymore
      if (beforeClose.startsWith('* @name') || beforeClose.startsWith('*@name')) {
        const match = beforeClose.match(/@name\s+(.+)/)
        if (match) {
          name = match[1].trim()
        }
      } else if (beforeClose.startsWith('* @description') || beforeClose.startsWith('*@description')) {
        const match = beforeClose.match(/@description\s+(.+)/)
        if (match) {
          description = match[1].trim() || null
        }
      } else if (beforeClose.startsWith('* @type') || beforeClose.startsWith('*@type')) {
        hasType = true
        const match = beforeClose.match(/@type\s+(.+)/)
        if (match) {
          type = match[1].trim()
        }
      }

      endLine = i
      break
    } else if (line.startsWith('* @name') || line.startsWith('*@name')) {
      // Extract name
      const match = line.match(/@name\s+(.+)/)
      if (match) {
        name = match[1].trim()
      }
    } else if (line.startsWith('* @description') || line.startsWith('*@description')) {
      // Extract description
      const match = line.match(/@description\s+(.+)/)
      if (match) {
        description = match[1].trim() || null
      }
    } else if (line.startsWith('* @type') || line.startsWith('*@type')) {
      // Found @type - this is group metadata (steps have @icon, not @type)
      hasType = true
      const match = line.match(/@type\s+(.+)/)
      if (match) {
        type = match[1].trim()
      }
    }
  }

  // If we found a JSDoc block at the top with @type, return parsed data
  if (hasType && endLine >= 0 && name && type) {
    // Validate and map type to enum
    const normalizedType = type.toUpperCase()
    if (normalizedType !== 'ACTION' && normalizedType !== 'VALIDATION') {
      throw new Error(`Invalid @type value: ${type}. Must be ACTION or VALIDATION`)
    }

    return {
      name: name.trim(),
      description: description ? description.trim() : null,
      type: normalizedType as TemplateStepGroupType,
    }
  }

  return null
}

/**
 * Scans step definition files in actions and validations directories
 */
async function scanStepFiles(baseDir: string): Promise<string[]> {
  const stepsDir = join(baseDir, 'src', 'tests', 'steps')
  const stepFiles: string[] = []

  try {
    // Get all .step.ts files in actions and validations directories
    const patterns = ['src/tests/steps/actions/**/*.step.ts', 'src/tests/steps/validations/**/*.step.ts']

    for (const pattern of patterns) {
      const files = await glob(pattern, {
        cwd: baseDir,
      })
      stepFiles.push(...files)
    }
  } catch (error) {
    console.error('Error scanning step files:', error)
    throw error
  }

  return stepFiles
}

/**
 * Reads and parses step files to extract step group metadata
 */
async function readStepGroupsFromFiles(baseDir: string): Promise<StepGroupData[]> {
  const stepFiles = await scanStepFiles(baseDir)
  const stepGroups: StepGroupData[] = []
  const errors: string[] = []

  for (const file of stepFiles) {
    try {
      const filePath = join(baseDir, file)
      const content = await fs.readFile(filePath, 'utf-8')
      const jsdoc = parseGroupJSDoc(content)

      if (jsdoc) {
        stepGroups.push(jsdoc)
      } else {
        errors.push(`File '${file}' does not have a valid group JSDoc comment`)
      }
    } catch (error) {
      const errorMsg = `Error reading file '${file}': ${error}`
      errors.push(errorMsg)
      console.error(`   ⚠️  ${errorMsg}`)
    }
  }

  if (errors.length > 0) {
    console.log(`\n⚠️  Warning: ${errors.length} file(s) skipped due to missing or invalid JSDoc:`)
    errors.forEach((error, index) => {
      console.log(`      ${index + 1}. ${error}`)
    })
  }

  return stepGroups
}

/**
 * Syncs step groups to database
 */
async function syncStepGroupsToDatabase(stepGroups: StepGroupData[]): Promise<SyncResult> {
  const result: SyncResult = {
    groupsScanned: stepGroups.length,
    groupsExisting: 0,
    groupsCreated: 0,
    groupsDeleted: 0,
    groupsSkipped: 0,
    groupsSkippedNoJSDoc: 0,
    errors: [],
    createdGroups: [],
    existingGroups: [],
    deletedGroups: [],
    skippedGroups: [],
    skippedNoJSDocFiles: [],
  }

  // Get set of step group names from filesystem
  const fsGroupNames = new Set(stepGroups.map(group => group.name))

  // Get all step groups from database
  const allDbGroups = await prisma.templateStepGroup.findMany({
    select: { id: true, name: true },
  })

  // Delete step groups from DB that are not in filesystem
  for (const dbGroup of allDbGroups) {
    if (!fsGroupNames.has(dbGroup.name)) {
      try {
        // Check if step group has template steps (foreign key constraint prevents deletion)
        const templateStepCount = await prisma.templateStep.count({
          where: { templateStepGroupId: dbGroup.id },
        })

        if (templateStepCount > 0) {
          result.groupsSkipped++
          result.skippedGroups.push(dbGroup.name)
          console.log(`   ⚠️  Skipped deletion of '${dbGroup.name}' (has ${templateStepCount} template step(s))`)
        } else {
          await prisma.templateStepGroup.delete({
            where: { id: dbGroup.id },
          })
          result.groupsDeleted++
          result.deletedGroups.push(dbGroup.name)
          console.log(`   🗑️  Deleted step group '${dbGroup.name}' (not in filesystem)`)
        }
      } catch (error) {
        const errorMsg = `Error deleting step group '${dbGroup.name}': ${error}`
        result.errors.push(errorMsg)
        console.error(`   ❌ ${errorMsg}`)
      }
    }
  }

  // Create or update step groups from filesystem
  for (const group of stepGroups) {
    try {
      // Check if step group already exists by name
      const existing = await prisma.templateStepGroup.findFirst({
        where: { name: group.name },
      })

      if (existing) {
        // Check if update is needed (description or type changed)
        const needsUpdate = existing.description !== group.description || existing.type !== group.type

        if (needsUpdate) {
          await prisma.templateStepGroup.update({
            where: { id: existing.id },
            data: {
              description: group.description,
              type: group.type,
            },
          })
          result.groupsExisting++
          result.existingGroups.push(group.name)
          console.log(`   🔄 Updated step group '${group.name}'`)
        } else {
          result.groupsExisting++
          result.existingGroups.push(group.name)
          console.log(`   ✓ Step group '${group.name}' already exists`)
        }
      } else {
        // Create the step group
        await prisma.templateStepGroup.create({
          data: {
            name: group.name,
            description: group.description,
            type: group.type,
          },
        })
        result.groupsCreated++
        result.createdGroups.push(group.name)
        console.log(`   ➕ Created step group '${group.name}'`)
      }
    } catch (error) {
      const errorMsg = `Error syncing step group '${group.name}': ${error}`
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
  console.log(`   📁 Step groups scanned: ${result.groupsScanned}`)
  console.log(`   ✅ Step groups existing: ${result.groupsExisting}`)
  console.log(`   ➕ Step groups created: ${result.groupsCreated}`)
  console.log(`   🗑️  Step groups deleted: ${result.groupsDeleted}`)
  console.log(`   ⚠️  Step groups skipped: ${result.groupsSkipped}`)
  console.log(`   ❌ Errors: ${result.errors.length}`)

  if (result.createdGroups.length > 0) {
    console.log('\n   Created step groups:')
    result.createdGroups.forEach((name, index) => {
      console.log(`      ${index + 1}. ${name}`)
    })
  }

  if (result.existingGroups.length > 0) {
    console.log('\n   Existing step groups:')
    result.existingGroups.forEach((name, index) => {
      console.log(`      ${index + 1}. ${name}`)
    })
  }

  if (result.deletedGroups.length > 0) {
    console.log('\n   Deleted step groups:')
    result.deletedGroups.forEach((name, index) => {
      console.log(`      ${index + 1}. ${name}`)
    })
  }

  if (result.skippedGroups.length > 0) {
    console.log('\n   Skipped step groups (have template steps):')
    result.skippedGroups.forEach((name, index) => {
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
    console.log('🔄 Starting template step group sync...')
    console.log('This will scan step definition files and sync step groups to database.\n')

    const baseDir = process.cwd()

    // Read step groups from files
    console.log('📁 Scanning step definition files...')
    const stepGroups = await readStepGroupsFromFiles(baseDir)
    console.log(`   Found ${stepGroups.length} step group(s) with valid JSDoc`)

    if (stepGroups.length === 0) {
      console.log('\n⚠️  No step groups found. Please ensure step files have valid JSDoc comments.')
      process.exit(0)
    }

    // Sync to database
    console.log('\n✅ Syncing step groups to database...')
    const result = await syncStepGroupsToDatabase(stepGroups)

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
