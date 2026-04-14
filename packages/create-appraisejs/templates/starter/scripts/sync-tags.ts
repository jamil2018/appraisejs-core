#!/usr/bin/env tsx

/**
 * Script to synchronize tags from feature files to database
 * Scans feature files to ensure all tags exist in DB
 * Filesystem is the source of truth - tags in DB but not in FS will be deleted
 * Run this after merging changes to ensure tag sync
 *
 * Usage: npx tsx scripts/sync-tags.ts
 */

import { join } from 'path'
import prisma from '../src/config/db-config'
import { scanFeatureFiles, ParsedFeature } from '../src/lib/gherkin-parser'
import { TagType } from '@prisma/client'
import { getTagTypeFromName } from '../src/lib/tag-utils'
import { splitTagLine } from './lib/tag-parsing'
import { printSyncSummary } from './lib/sync-summary'
import { runSyncScript } from './lib/sync-script-runner'

interface TagData {
  name: string // Without @ prefix, for DB storage
  tagExpression: string // With @ prefix, for tagExpression field
  type: TagType // IDENTIFIER or FILTER
}

interface SyncResult {
  tagsScanned: number
  tagsExisting: number
  tagsCreated: number
  tagsUpdated: number
  tagsDeleted: number
  errors: string[]
  createdTags: string[]
  updatedTags: string[]
  deletedTags: string[]
}

/**
 * Extracts unique tags from parsed feature files
 * Combines feature-level and scenario-level tags
 * Handles tags on the same line separated by spaces
 */
function extractUniqueTags(parsedFeatures: ParsedFeature[]): Set<string> {
  const uniqueTags = new Set<string>()

  for (const feature of parsedFeatures) {
    // Add feature-level tags
    for (const tagLine of feature.tags) {
      if (tagLine.startsWith('@')) {
        // Split tags that might be on the same line
        const tags = splitTagLine(tagLine)
        for (const tag of tags) {
          uniqueTags.add(tag)
        }
      }
    }

    // Add scenario-level tags
    for (const scenario of feature.scenarios) {
      for (const tagLine of scenario.tags) {
        if (tagLine.startsWith('@')) {
          // Split tags that might be on the same line
          const tags = splitTagLine(tagLine)
          for (const tag of tags) {
            uniqueTags.add(tag)
          }
        }
      }
    }
  }

  return uniqueTags
}

/**
 * Builds Tag objects from tag expressions
 * Maps tag expressions to Prisma Tag model structure
 */
function buildTagObjects(tagExpressions: Set<string>): TagData[] {
  const tagObjects: TagData[] = []

  for (const tagExpression of tagExpressions) {
    // Strip @ prefix for name field
    const name = tagExpression.startsWith('@') ? tagExpression.substring(1) : tagExpression

    const type = getTagTypeFromName(name)

    tagObjects.push({
      name,
      tagExpression, // Keep @ prefix for tagExpression
      type,
    })
  }

  return tagObjects
}

/**
 * Syncs tags to database
 * Creates missing tags and deletes orphaned tags (FS is source of truth)
 */
async function syncTagsToDatabase(tagObjects: TagData[]): Promise<SyncResult> {
  const result: SyncResult = {
    tagsScanned: tagObjects.length,
    tagsExisting: 0,
    tagsCreated: 0,
    tagsUpdated: 0,
    tagsDeleted: 0,
    errors: [],
    createdTags: [],
    updatedTags: [],
    deletedTags: [],
  }

  // Get set of tag names from feature files (FS source of truth)
  const fsTagNames = new Set(tagObjects.map(tag => tag.name))

  // Get all tags from database
  const allDbTags = await prisma.tag.findMany({
    select: { id: true, name: true },
  })

  // Delete tags from DB that are not in FS (FS is source of truth)
  console.log('\n🔍 Checking for orphaned tags (not in feature files)...')
  for (const dbTag of allDbTags) {
    if (!fsTagNames.has(dbTag.name)) {
      try {
        await prisma.tag.delete({
          where: { id: dbTag.id },
        })
        result.tagsDeleted++
        result.deletedTags.push(dbTag.name)
        console.log(`   🗑️  Deleted tag '${dbTag.name}' (not in feature files)`)
      } catch (error) {
        const errorMsg = `Error deleting tag '${dbTag.name}': ${error}`
        result.errors.push(errorMsg)
        console.error(`   ❌ ${errorMsg}`)
      }
    }
  }

  // Create or check tags from FS
  console.log('\n✅ Syncing tags from feature files to database...')
  for (const tagData of tagObjects) {
    try {
      // Check if tag already exists by name (names are unique per user requirement)
      const existing = await prisma.tag.findFirst({
        where: { name: tagData.name },
      })

      if (existing) {
        // If tag exists but has wrong type, update it
        // This fixes tags that were created with wrong type (e.g., via UI or old code)
        if (existing.type !== tagData.type) {
          await prisma.tag.update({
            where: { id: existing.id },
            data: { type: tagData.type },
          })
          result.tagsUpdated++
          result.updatedTags.push(tagData.name)
          console.log(`   🔄 Updated tag '${tagData.name}' type from ${existing.type} to ${tagData.type}`)
        } else {
          result.tagsExisting++
          console.log(`   ✓ Tag '${tagData.name}' already exists`)
        }
      } else {
        // Create the tag
        await prisma.tag.create({
          data: {
            name: tagData.name,
            tagExpression: tagData.tagExpression,
            type: tagData.type,
          },
        })
        result.tagsCreated++
        result.createdTags.push(tagData.name)
        console.log(`   ➕ Created tag '${tagData.name}' (type: ${tagData.type})`)
      }
    } catch (error) {
      const errorMsg = `Error syncing tag '${tagData.name}': ${error}`
      result.errors.push(errorMsg)
      console.error(`   ❌ ${errorMsg}`)
    }
  }

  return result
}

/**
 * Generates and displays sync summary
 */
async function main(): Promise<SyncResult | void> {
    console.log('🔄 Starting tags sync...')
    console.log('This will scan feature files and sync tags to database.')
    console.log('Filesystem is the source of truth - tags in DB but not in FS will be deleted.\n')

    const baseDir = process.cwd()
    const featuresDir = join(baseDir, 'automation', 'features')

    // Scan feature files
    console.log('📁 Scanning feature files in automation/features...')
    const parsedFeatures = await scanFeatureFiles(featuresDir)
    console.log(`   Found ${parsedFeatures.length} feature file(s)`)

    if (parsedFeatures.length === 0) {
      console.log('\n⚠️  No feature files found. Nothing to sync.')
      return
    }

    // Extract unique tags
    console.log('\n🔍 Extracting unique tags from feature files...')
    const uniqueTagExpressions = extractUniqueTags(parsedFeatures)
    console.log(`   Found ${uniqueTagExpressions.size} unique tag(s)`)

    if (uniqueTagExpressions.size === 0) {
      console.log('\n⚠️  No tags found in feature files. Nothing to sync.')
      return
    }

    // Build tag objects
    console.log('\n🔨 Building tag objects...')
    const tagObjects = buildTagObjects(uniqueTagExpressions)
    console.log(`   Built ${tagObjects.length} tag object(s)`)

    // Log tag details
    console.log('\n   Tag details:')
    for (const tag of tagObjects) {
      console.log(`      - ${tag.tagExpression} → name: '${tag.name}', type: ${tag.type}`)
    }

    // Sync to database
    const result = await syncTagsToDatabase(tagObjects)

    printSyncSummary(
      [
        { label: '📁 Tags scanned', value: result.tagsScanned },
        { label: '✅ Tags existing', value: result.tagsExisting },
        { label: '➕ Tags created', value: result.tagsCreated },
        { label: '🔄 Tags updated', value: result.tagsUpdated },
        { label: '🗑️  Tags deleted', value: result.tagsDeleted },
        { label: '❌ Errors', value: result.errors.length },
      ],
      [
        { title: 'Updated tags', items: result.updatedTags },
        { title: 'Created tags', items: result.createdTags },
        { title: 'Deleted tags', items: result.deletedTags },
        { title: 'Errors', items: result.errors },
      ],
    )

    return result
}

runSyncScript(main)
