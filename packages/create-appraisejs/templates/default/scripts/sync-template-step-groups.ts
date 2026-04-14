#!/usr/bin/env tsx

/**
 * Script to synchronize template step groups from filesystem to database
 * Scans step definition files to ensure all step groups exist in DB
 * Filesystem is the source of truth - groups in DB but not in FS will be deleted
 * Run this after merging changes to ensure step group sync
 *
 * Usage: npx tsx scripts/sync-template-step-groups.ts
 */

import { promises as fs } from 'fs'
import { join } from 'path'
import { glob } from 'glob'
import prisma from '../src/config/db-config'
import { TemplateStepGroupType } from '@prisma/client'
import { parseGroupJSDoc } from './lib/jsdoc-parser'
import { printSyncSummary } from './lib/sync-summary'
import { runSyncScript } from './lib/sync-script-runner'

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
  errors: string[]
  createdGroups: string[]
  existingGroups: string[]
  deletedGroups: string[]
  skippedGroups: string[]
}

/**
 * Scans step definition files in actions and validations directories
 */
async function scanStepFiles(baseDir: string): Promise<string[]> {
  const stepFiles: string[] = []

  try {
    // Get all .step.ts files in actions and validations directories
    const patterns = ['automation/steps/actions/**/*.step.ts', 'automation/steps/validations/**/*.step.ts']

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
    errors: [],
    createdGroups: [],
    existingGroups: [],
    deletedGroups: [],
    skippedGroups: [],
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
async function main(): Promise<SyncResult> {
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

    printSyncSummary(
      [
        { label: '📁 Step groups scanned', value: result.groupsScanned },
        { label: '✅ Step groups existing', value: result.groupsExisting },
        { label: '➕ Step groups created', value: result.groupsCreated },
        { label: '🗑️  Step groups deleted', value: result.groupsDeleted },
        { label: '⚠️  Step groups skipped', value: result.groupsSkipped },
        { label: '❌ Errors', value: result.errors.length },
      ],
      [
        { title: 'Created step groups', items: result.createdGroups },
        { title: 'Existing step groups', items: result.existingGroups },
        { title: 'Deleted step groups', items: result.deletedGroups },
        { title: 'Skipped step groups (have template steps)', items: result.skippedGroups },
        { title: 'Errors', items: result.errors },
      ],
    )
    return result
}

runSyncScript(main)
