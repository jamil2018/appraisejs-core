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
import { hasTemplateStepReferences } from './lib/template-step-sync'
import { readTemplateStepOperationMappings } from './lib/operation-ledger-reader'

interface SyncResult {
  stepsScanned: number
  stepsExisting: number
  stepsCreated: number
  stepsUpdated: number
  stepsDeleted: number
  stepsPreserved: number
  errors: string[]
  createdSteps: Array<{ name: string; signature: string; group: string }>
  updatedSteps: Array<{ name: string; signature: string; group: string }>
  deletedSteps: Array<{ name: string; signature: string; group: string }>
  preservedSteps: Array<{ name: string; signature: string; group: string }>
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

type StepEntry = { step: ParsedStep; groupName: string; filePath: string }
type OperationMapping =
  Awaited<ReturnType<typeof readTemplateStepOperationMappings>> extends Map<string, infer Value> ? Value : never

function emptySyncResult(): SyncResult {
  return {
    stepsScanned: 0,
    stepsExisting: 0,
    stepsCreated: 0,
    stepsUpdated: 0,
    stepsDeleted: 0,
    stepsPreserved: 0,
    errors: [],
    createdSteps: [],
    updatedSteps: [],
    deletedSteps: [],
    preservedSteps: [],
  }
}

function stepSummary(entry: StepEntry) {
  return { name: entry.step.jsdoc.name, signature: entry.step.signature, group: entry.groupName }
}

function templateStepData(
  entry: StepEntry,
  group: { id: string; type: TemplateStepGroupType },
  functionDefinition: string,
  operationMapping: OperationMapping,
) {
  return {
    name: entry.step.jsdoc.name,
    description: normalizeOptionalText(entry.step.jsdoc.description),
    signature: entry.step.signature,
    functionDefinition,
    icon: entry.step.jsdoc.icon,
    type: group.type === TemplateStepGroupType.ACTION ? TemplateStepType.ACTION : TemplateStepType.ASSERTION,
    templateStepGroupId: group.id,
    ...operationMapping,
  }
}

function templateStepNeedsUpdate(existing: Record<string, unknown>, data: Record<string, unknown>) {
  return Object.entries(data).some(([key, value]) => (existing[key] ?? null) !== (value ?? null))
}

async function createParsedStep(entry: StepEntry, data: ReturnType<typeof templateStepData>) {
  await prisma.templateStep.create({
    data: {
      ...data,
      parameters: {
        create: entry.step.parameters.map(param => ({ name: param.name, type: param.type, order: param.order })),
      },
    },
  })
}

async function updateParsedStep(id: string, entry: StepEntry, data: ReturnType<typeof templateStepData>) {
  await prisma.templateStep.update({
    where: { id },
    data: {
      ...data,
      parameters: {
        deleteMany: {},
        create: entry.step.parameters.map(param => ({ name: param.name, type: param.type, order: param.order })),
      },
    },
  })
}

async function syncParsedStep(entry: StepEntry, operationMapping: OperationMapping, result: SyncResult) {
  const group = await prisma.templateStepGroup.findFirst({ where: { name: entry.groupName } })
  if (!group) throw new Error(`Template step group '${entry.groupName}' not found`)
  const functionDefinition = await normalizeFunctionDefinition(entry.step.functionDefinition)
  const data = templateStepData(entry, group, functionDefinition, operationMapping)
  const existing = await prisma.templateStep.findFirst({ where: { signature: entry.step.signature } })
  if (!existing) {
    await createParsedStep(entry, data)
    result.stepsCreated += 1
    result.createdSteps.push(stepSummary(entry))
    console.log(`   ➕ Created step '${entry.step.jsdoc.name}' (${entry.step.signature})`)
    return
  }
  if (!templateStepNeedsUpdate(existing, data)) {
    result.stepsExisting += 1
    return
  }
  await updateParsedStep(existing.id, entry, data)
  result.stepsUpdated += 1
  result.updatedSteps.push(stepSummary(entry))
  console.log(`   🔄 Updated step '${entry.step.jsdoc.name}' (${entry.step.signature})`)
}

async function deleteOrphanedStep(id: string) {
  await prisma.$transaction(async tx => {
    await tx.templateTestCaseStepParameter.deleteMany({ where: { templateTestCaseStep: { templateStepId: id } } })
    await tx.templateTestCaseStep.deleteMany({ where: { templateStepId: id } })
    await tx.testCaseStepParameter.deleteMany({ where: { testCaseStep: { templateStepId: id } } })
    await tx.testCaseStep.deleteMany({ where: { templateStepId: id } })
    await tx.templateStepParameter.deleteMany({ where: { templateStepId: id } })
    await tx.templateStep.delete({ where: { id } })
  })
}

async function preserveOrphanedStep(step: { id: string; operationMigrationState: string | null }) {
  return step.operationMigrationState === 'manual-only-custom' || (await hasTemplateStepReferences(prisma, step.id))
}

async function reconcileOrphanedStep(
  dbStep: Awaited<ReturnType<typeof prisma.templateStep.findMany>>[number] & {
    templateStepGroup: { name: string }
  },
  result: SyncResult,
) {
  const summary = { name: dbStep.name, signature: dbStep.signature, group: dbStep.templateStepGroup.name }
  if (await preserveOrphanedStep(dbStep)) {
    result.stepsPreserved += 1
    result.preservedSteps.push(summary)
    console.warn(`   ⚠️  Preserved custom or referenced step '${dbStep.name}' (${dbStep.signature})`)
    return
  }
  await deleteOrphanedStep(dbStep.id)
  result.stepsDeleted += 1
  result.deletedSteps.push(summary)
  console.log(`   🗑️  Deleted step '${dbStep.name}' (${dbStep.signature})`)
}

async function syncEntry(entry: StepEntry, operationMappings: Map<string, OperationMapping>, result: SyncResult) {
  result.stepsScanned += 1
  try {
    const mapping = operationMappings.get(entry.step.signature)
    if (!mapping) throw new Error(`Approved operation mapping is missing for ${entry.step.signature}.`)
    await syncParsedStep(entry, mapping, result)
  } catch (error) {
    const errorMsg = `Error syncing step '${entry.step.signature}' from ${entry.filePath}: ${error}`
    result.errors.push(errorMsg)
    console.error(`   ❌ ${errorMsg}`)
  }
}

async function reconcileOrphans(fsSignatures: Set<string>, result: SyncResult) {
  const allDbSteps = await prisma.templateStep.findMany({ include: { templateStepGroup: true } })
  for (const dbStep of allDbSteps.filter(step => !fsSignatures.has(step.signature))) {
    try {
      await reconcileOrphanedStep(dbStep, result)
    } catch (error) {
      const errorMsg = `Error deleting step '${dbStep.signature}': ${error}`
      result.errors.push(errorMsg)
      console.error(`   ❌ ${errorMsg}`)
    }
  }
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
async function syncStepsToDatabase(allSteps: StepEntry[], baseDir: string): Promise<SyncResult> {
  const result = emptySyncResult()
  const fsSignatures = new Set(allSteps.map(entry => entry.step.signature))
  const operationMappings = await readTemplateStepOperationMappings(baseDir)
  for (const entry of allSteps) await syncEntry(entry, operationMappings, result)
  console.log('\n🔍 Checking for orphaned template steps (not in filesystem)...')
  await reconcileOrphans(fsSignatures, result)
  return result
}

/**
 * Generates and displays sync summary
 */
async function main(): Promise<SyncResult | void> {
  console.log('🔄 Starting template step sync...')
  console.log('This will scan step definition files and sync template steps to database.')
  console.log(
    'Generated built-ins are authoritative; manual-only custom and referenced historical steps are preserved.\n',
  )

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
  const result = await syncStepsToDatabase(allSteps, baseDir)

  // Add parsing errors to result
  result.errors.push(...errors)

  printSyncSummary(
    [
      { label: '📁 Steps scanned', value: result.stepsScanned },
      { label: '✅ Steps existing', value: result.stepsExisting },
      { label: '➕ Steps created', value: result.stepsCreated },
      { label: '🔄 Steps updated', value: result.stepsUpdated },
      { label: '🗑️  Steps deleted', value: result.stepsDeleted },
      { label: '🛡️  Referenced steps preserved', value: result.stepsPreserved },
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
      {
        title: 'Referenced steps preserved',
        items: result.preservedSteps.map(step => `${step.name} (${step.signature}) [${step.group}]`),
      },
      { title: 'Errors', items: result.errors },
    ],
  )
  return result
}

runSyncScript(main)
