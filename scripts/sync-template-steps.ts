#!/usr/bin/env tsx

/**
 * Script to synchronize template steps from filesystem to database
 * Scans step definition files to ensure all template steps exist in DB
 * Filesystem is the source of truth - steps in DB but not in FS will be deleted
 * Run this after merging changes to ensure template step sync
 *
 * Usage: npx tsx scripts/sync-template-steps.ts
 */

import { promises as fs } from 'fs'
import { join } from 'path'
import { glob } from 'glob'

import prisma from '../src/config/db-config'
import { normalizeFunctionDefinition } from '../src/lib/sync/normalize-function-definition'
import { TemplateStepGroupType, TemplateStepType } from '@prisma/client'
import { parseStepFile, ParsedStep } from './lib/step-file-parser'
import { printSyncSummary } from './lib/sync-summary'
import { runSyncScript } from './lib/sync-script-runner'

interface SyncResult {
  stepsScanned: number
  stepsExisting: number
  stepsCreated: number
  stepsUpdated: number
  stepsDeleted: number
  errors: string[]
  createdSteps: Array<{ name: string; signature: string; group: string }>
  updatedSteps: Array<{ name: string; signature: string; group: string }>
  deletedSteps: Array<{ name: string; signature: string; group: string }>
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

/**
 * Scans step definition files
 */
async function scanStepFiles(baseDir: string): Promise<string[]> {
  const patterns = ['automation/steps/actions/**/*.step.ts', 'automation/steps/validations/**/*.step.ts']
  const stepFiles: string[] = []

  for (const pattern of patterns) {
    const files = await glob(pattern, {
      cwd: baseDir,
    })
    stepFiles.push(...files)
  }

  return stepFiles
}

/**
 * Syncs template steps to database
 */
async function syncStepsToDatabase(
  allSteps: Array<{ step: ParsedStep; groupName: string; filePath: string }>,
): Promise<SyncResult> {
  const result: SyncResult = {
    stepsScanned: 0,
    stepsExisting: 0,
    stepsCreated: 0,
    stepsUpdated: 0,
    stepsDeleted: 0,
    errors: [],
    createdSteps: [],
    updatedSteps: [],
    deletedSteps: [],
  }

  // Signature is treated as the stable sync identity for template steps.
  const fsSignatures = new Set<string>()

  // Process each step
  for (const { step, groupName, filePath } of allSteps) {
    try {
      result.stepsScanned++
      fsSignatures.add(step.signature)

      // Find template step group
      const stepGroup = await prisma.templateStepGroup.findFirst({
        where: { name: groupName },
      })

      if (!stepGroup) {
        const errorMsg = `Template step group '${groupName}' not found for step '${step.signature}' in ${filePath}`
        result.errors.push(errorMsg)
        console.error(`   ❌ ${errorMsg}`)
        continue
      }

      // Determine step type from group type
      const stepType: TemplateStepType =
        stepGroup.type === TemplateStepGroupType.ACTION ? TemplateStepType.ACTION : TemplateStepType.ASSERTION
      const description = normalizeOptionalText(step.jsdoc.description)
      const functionDefinition = await normalizeFunctionDefinition(step.functionDefinition)

      // Check if step exists by signature
      const existingStep = await prisma.templateStep.findFirst({
        where: {
          signature: step.signature,
        },
        include: {
          templateStepGroup: true,
        },
      })

      if (existingStep) {
        // Check if update is needed
        const needsUpdate =
          existingStep.name !== step.jsdoc.name ||
          (existingStep.description ?? null) !== description ||
          existingStep.signature !== step.signature ||
          (existingStep.functionDefinition ?? '') !== functionDefinition ||
          existingStep.icon !== step.jsdoc.icon ||
          existingStep.type !== stepType ||
          existingStep.templateStepGroupId !== stepGroup.id

        if (needsUpdate) {
          // Update step and parameters
          await prisma.templateStep.update({
            where: { id: existingStep.id },
            data: {
              name: step.jsdoc.name,
              description,
              signature: step.signature,
              functionDefinition,
              icon: step.jsdoc.icon,
              type: stepType,
              templateStepGroupId: stepGroup.id,
              parameters: {
                deleteMany: {},
                create: step.parameters.map(param => ({
                  name: param.name,
                  type: param.type,
                  order: param.order,
                })),
              },
            },
          })
          result.stepsUpdated++
          result.updatedSteps.push({
            name: step.jsdoc.name,
            signature: step.signature,
            group: groupName,
          })
          console.log(`   🔄 Updated step '${step.jsdoc.name}' (${step.signature})`)
        } else {
          result.stepsExisting++
        }
      } else {
        // Create new step
        await prisma.templateStep.create({
          data: {
            name: step.jsdoc.name,
            description,
            signature: step.signature,
            functionDefinition,
            icon: step.jsdoc.icon,
            type: stepType,
            templateStepGroupId: stepGroup.id,
            parameters: {
              create: step.parameters.map(param => ({
                name: param.name,
                type: param.type,
                order: param.order,
              })),
            },
          },
        })
        result.stepsCreated++
        result.createdSteps.push({
          name: step.jsdoc.name,
          signature: step.signature,
          group: groupName,
        })
        console.log(`   ➕ Created step '${step.jsdoc.name}' (${step.signature})`)
      }
    } catch (error) {
      const errorMsg = `Error syncing step '${step.signature}' from ${filePath}: ${error}`
      result.errors.push(errorMsg)
      console.error(`   ❌ ${errorMsg}`)
    }
  }

  // Delete steps that don't exist in filesystem
  console.log('\n🔍 Checking for orphaned template steps (not in filesystem)...')
  const allDbSteps = await prisma.templateStep.findMany({
    include: {
      templateStepGroup: true,
    },
  })

  for (const dbStep of allDbSteps) {
    if (!fsSignatures.has(dbStep.signature)) {
      try {
        // Delete in order: child records first. TemplateTestCaseStepParameter and
        // TestCaseStepParameter have no onDelete cascade, so they must be removed
        // before TemplateTestCaseStep/TestCaseStep (which are cascade-deleted from TemplateStep).
        await prisma.$transaction(async tx => {
          await tx.templateTestCaseStepParameter.deleteMany({
            where: { templateTestCaseStep: { templateStepId: dbStep.id } },
          })
          await tx.templateTestCaseStep.deleteMany({
            where: { templateStepId: dbStep.id },
          })
          await tx.testCaseStepParameter.deleteMany({
            where: { testCaseStep: { templateStepId: dbStep.id } },
          })
          await tx.testCaseStep.deleteMany({
            where: { templateStepId: dbStep.id },
          })
          await tx.templateStepParameter.deleteMany({
            where: { templateStepId: dbStep.id },
          })
          await tx.templateStep.delete({
            where: { id: dbStep.id },
          })
        })
        result.stepsDeleted++
        result.deletedSteps.push({
          name: dbStep.name,
          signature: dbStep.signature,
          group: dbStep.templateStepGroup.name,
        })
        console.log(`   🗑️  Deleted step '${dbStep.name}' (${dbStep.signature})`)
      } catch (error) {
        const errorMsg = `Error deleting step '${dbStep.signature}': ${error}`
        result.errors.push(errorMsg)
        console.error(`   ❌ ${errorMsg}`)
      }
    }
  }

  return result
}

/**
 * Generates and displays sync summary
 */
async function main(): Promise<SyncResult | void> {
  console.log('🔄 Starting template step sync...')
  console.log('This will scan step definition files and sync template steps to database.')
  console.log('Filesystem is the source of truth - steps in DB but not in FS will be deleted.\n')

  const baseDir = process.cwd()

  // Scan step files
  console.log('📁 Scanning step definition files...')
  const stepFiles = await scanStepFiles(baseDir)
  console.log(`   Found ${stepFiles.length} step file(s)`)

  if (stepFiles.length === 0) {
    console.log('\n⚠️  No step files found. Nothing to sync.')
    return
  }

  // Parse all files
  console.log('\n📖 Parsing step files...')
  const allSteps: Array<{ step: ParsedStep; groupName: string; filePath: string }> = []
  const errors: string[] = []

  for (const file of stepFiles) {
    try {
      const filePath = join(baseDir, file)
      const content = await fs.readFile(filePath, 'utf-8')
      const stepData = parseStepFile(content, file)

      if (!stepData) {
        errors.push(`File '${file}' does not have a valid group JSDoc comment`)
        console.log(`   ⚠️  Skipped '${file}' (no group JSDoc)`)
        continue
      }

      if (stepData.steps.length === 0) {
        console.log(`   ⚠️  No steps found in '${file}'`)
        continue
      }

      console.log(`   ✓ Parsed '${file}' (${stepData.steps.length} step(s))`)

      for (const step of stepData.steps) {
        allSteps.push({
          step,
          groupName: stepData.group.name,
          filePath: file,
        })
      }
    } catch (error) {
      const errorMsg = `Error parsing file '${file}': ${error}`
      errors.push(errorMsg)
      console.error(`   ❌ ${errorMsg}`)
    }
  }

  if (errors.length > 0 && allSteps.length === 0) {
    console.log('\n⚠️  No valid steps found. Please check the errors above.')
    process.exit(1)
  }

  // Check for duplicate signatures
  const signatureMap = new Map<string, string[]>()
  for (const { step, filePath } of allSteps) {
    if (!signatureMap.has(step.signature)) {
      signatureMap.set(step.signature, [])
    }
    signatureMap.get(step.signature)!.push(filePath)
  }

  for (const [signature, files] of signatureMap.entries()) {
    if (files.length > 1) {
      const errorMsg = `Duplicate signature found: "${signature}" in files: ${files.join(', ')}`
      errors.push(errorMsg)
      console.error(`   ❌ ${errorMsg}`)
    }
  }

  if (errors.length > 0 && allSteps.length === 0) {
    console.log('\n⚠️  Cannot proceed due to errors. Please fix the issues above.')
    process.exit(1)
  }

  // Sync to database
  console.log('\n✅ Syncing template steps to database...')
  const result = await syncStepsToDatabase(allSteps)

  // Add parsing errors to result
  result.errors.push(...errors)

  printSyncSummary(
    [
      { label: '📁 Steps scanned', value: result.stepsScanned },
      { label: '✅ Steps existing', value: result.stepsExisting },
      { label: '➕ Steps created', value: result.stepsCreated },
      { label: '🔄 Steps updated', value: result.stepsUpdated },
      { label: '🗑️  Steps deleted', value: result.stepsDeleted },
      { label: '❌ Errors', value: result.errors.length },
    ],
    [
      {
        title: 'Created steps',
        items: result.createdSteps.map(step => `${step.name} (${step.signature}) [${step.group}]`),
      },
      {
        title: 'Updated steps',
        items: result.updatedSteps.map(step => `${step.name} (${step.signature}) [${step.group}]`),
      },
      {
        title: 'Deleted steps',
        items: result.deletedSteps.map(step => `${step.name} (${step.signature}) [${step.group}]`),
      },
      { title: 'Errors', items: result.errors },
    ],
  )
  return result
}

runSyncScript(main)
