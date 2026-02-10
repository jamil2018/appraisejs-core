#!/usr/bin/env tsx

/**
 * Script to synchronize template steps from filesystem to database
 * Scans step definition files to ensure all template steps exist in DB
 * Filesystem is the source of truth - steps in DB but not in FS will be deleted
 * Run this after merging changes to ensure template step sync
 *
 * Usage: npx tsx scripts/template-step-sync.ts
 */

import { promises as fs } from 'fs'
import { join } from 'path'
import { glob } from 'glob'
import { parse } from '@babel/parser'
import * as t from '@babel/types'
import _traverse from '@babel/traverse'
import type { NodePath } from '@babel/traverse'

// Handle both ESM and CJS exports
const traverse = (_traverse as { default?: typeof _traverse }).default ?? _traverse
import prisma from '../src/config/db-config'
import { TemplateStepGroupType, TemplateStepType, TemplateStepIcon, StepParameterType } from '@prisma/client'

interface StepGroupJSDoc {
  name: string
  description: string | null
  type: TemplateStepGroupType
}

interface StepJSDoc {
  name: string
  description: string | null
  icon: TemplateStepIcon
}

interface StepParameter {
  name: string
  type: StepParameterType
  order: number
}

interface ParsedStep {
  jsdoc: StepJSDoc
  signature: string
  functionDefinition: string
  parameters: StepParameter[]
  keyword: 'When' | 'Then' | 'Given'
}

interface StepData {
  group: StepGroupJSDoc
  steps: ParsedStep[]
  filePath: string
}

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

/**
 * Parses JSDoc comment to extract step group metadata
 * Reused from template-step-group-sync.ts
 */
function parseGroupJSDoc(content: string): StepGroupJSDoc | null {
  const lines = content.split('\n')

  if (lines.length === 0) {
    return null
  }

  const firstLine = lines[0].trim()
  if (!firstLine.startsWith('/**')) {
    return null
  }

  let hasType = false
  let endLine = -1
  let name: string | null = null
  let description: string | null = null
  let type: string | null = null

  const maxLines = Math.min(lines.length, 50)
  for (let i = 0; i < maxLines; i++) {
    const line = lines[i].trim()

    if (line.includes('*/')) {
      const beforeClose = line.split('*/')[0].trim()

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
      const match = line.match(/@name\s+(.+)/)
      if (match) {
        name = match[1].trim()
      }
    } else if (line.startsWith('* @description') || line.startsWith('*@description')) {
      const match = line.match(/@description\s+(.+)/)
      if (match) {
        description = match[1].trim() || null
      }
    } else if (line.startsWith('* @type') || line.startsWith('*@type')) {
      hasType = true
      const match = line.match(/@type\s+(.+)/)
      if (match) {
        type = match[1].trim()
      }
    }
  }

  if (hasType && endLine >= 0 && name && type) {
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
 * Parses JSDoc comment to extract step metadata
 */
function parseStepJSDoc(content: string, startLine: number): StepJSDoc | null {
  const lines = content.split('\n')

  // Look backwards from startLine for JSDoc comment
  // startLine is 0-based (line number - 1)
  let jsdocStart = -1
  for (let i = startLine - 1; i >= 0 && i >= startLine - 20; i--) {
    const line = lines[i]?.trim()
    // Check for end of JSDoc (could be on its own line or with content)
    if (line?.includes('*/')) {
      // Found end, now find start
      jsdocStart = i
      // Look backwards for the start
      for (let j = i - 1; j >= 0 && j >= i - 10; j--) {
        const prevLine = lines[j]?.trim()
        if (prevLine?.startsWith('/**')) {
          jsdocStart = j
          break
        }
      }
      break
    } else if (line?.startsWith('/**')) {
      jsdocStart = i
      break
    }
  }

  if (jsdocStart === -1) {
    return null
  }

  let name: string | null = null
  let description: string | null = null
  let icon: string | null = null
  let foundJSDoc = false

  for (let i = jsdocStart; i < Math.min(lines.length, jsdocStart + 20); i++) {
    const line = lines[i]?.trim()

    if (line?.startsWith('/**')) {
      foundJSDoc = true
      continue
    }

    if (line?.includes('*/')) {
      const beforeClose = line.split('*/')[0].trim()
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
      } else if (beforeClose.startsWith('* @icon') || beforeClose.startsWith('*@icon')) {
        const match = beforeClose.match(/@icon\s+(.+)/)
        if (match) {
          icon = match[1].trim()
        }
      }
      break
    }

    if (foundJSDoc) {
      if (line?.startsWith('* @name') || line?.startsWith('*@name')) {
        const match = line.match(/@name\s+(.+)/)
        if (match) {
          name = match[1].trim()
        }
      } else if (line?.startsWith('* @description') || line?.startsWith('*@description')) {
        const match = line.match(/@description\s+(.+)/)
        if (match) {
          description = match[1].trim() || null
        }
      } else if (line?.startsWith('* @icon') || line?.startsWith('*@icon')) {
        const match = line.match(/@icon\s+(.+)/)
        if (match) {
          icon = match[1].trim()
        }
      }
    }
  }

  if (!name || !icon) {
    return null
  }

  // Validate icon
  const iconUpper = icon.toUpperCase()
  const validIcons = Object.values(TemplateStepIcon)
  if (!validIcons.includes(iconUpper as TemplateStepIcon)) {
    throw new Error(`Invalid @icon value: ${icon}. Must be one of: ${validIcons.join(', ')}`)
  }

  return {
    name: name.trim(),
    description: description ? description.trim() : null,
    icon: iconUpper as TemplateStepIcon,
  }
}

/**
 * Maps TypeScript type to StepParameterType
 * Strict mode - throws error for unsupported types
 */
function mapTypeToParameterType(typeName: string): StepParameterType {
  const normalized = typeName.trim()

  if (normalized === 'SelectorName') {
    return StepParameterType.LOCATOR
  }
  if (normalized === 'string') {
    return StepParameterType.STRING
  }
  if (normalized === 'number' || normalized === 'int') {
    return StepParameterType.NUMBER
  }
  if (normalized === 'boolean') {
    return StepParameterType.BOOLEAN
  }
  if (normalized === 'Date') {
    return StepParameterType.DATE
  }

  throw new Error(
    `Unsupported parameter type: ${typeName}. Supported types: SelectorName, string, number, int, boolean, Date`,
  )
}

/**
 * Extracts function definition code from AST node
 * Returns the complete When/Then/Given call with function, without JSDoc
 * Format: When('pattern', async function(this:CustomWorld, param: type){})
 */
function extractFunctionDefinition(callExpr: t.CallExpression, keyword: string, sourceCode: string): string {
  // Get the source code for the entire call expression
  const start = callExpr.start
  const end = callExpr.end

  if (start == null || end == null) {
    throw new Error('Cannot extract function definition: missing position information')
  }

  // Extract the code - Babel's end position includes the closing parenthesis
  // After the null check, TypeScript knows start and end are numbers
  let code = sourceCode.slice(start, end).trim()

  // Check if there's a semicolon immediately after (some files have it, some don't)
  // Only add if it's clearly there in the source
  const afterEnd = sourceCode.slice(end, end + 10).trim()
  if (afterEnd.startsWith(';')) {
    code += ';'
  }

  return code
}

/**
 * Parses a step definition file to extract steps
 */
function parseStepFile(content: string, filePath: string): StepData | null {
  // Parse group JSDoc
  const group = parseGroupJSDoc(content)
  if (!group) {
    return null
  }

  // Parse TypeScript AST
  let ast
  try {
    ast = parse(content, {
      sourceType: 'module',
      plugins: ['typescript', 'decorators-legacy'],
    })
  } catch (error) {
    throw new Error(`Failed to parse TypeScript: ${error}`)
  }

  const steps: ParsedStep[] = []

  // Traverse the AST to find When/Then/Given calls
  traverse(ast, {
    CallExpression(path: NodePath<t.CallExpression>) {
      const node = path.node
      const callee = node.callee

      // Check if this is a When, Then, or Given call
      let keyword: 'When' | 'Then' | 'Given' | null = null
      if (t.isIdentifier(callee)) {
        if (callee.name === 'When' || callee.name === 'Then' || callee.name === 'Given') {
          keyword = callee.name as 'When' | 'Then' | 'Given'
        }
      }

      if (!keyword || node.arguments.length < 2) {
        return
      }

      // Extract Gherkin pattern (first argument - should be a string)
      const patternArg = node.arguments[0]
      if (!t.isStringLiteral(patternArg)) {
        return
      }
      const signature = patternArg.value

      // Extract function (second argument)
      const funcArg = node.arguments[1]
      if (!t.isFunction(funcArg)) {
        return
      }

      // Get line number for JSDoc lookup (Babel uses 1-based line numbers)
      const lineNumber = node.loc?.start?.line
      if (lineNumber === undefined) {
        return
      }

      // Parse step JSDoc (convert to 0-based for array indexing)
      const jsdoc = parseStepJSDoc(content, lineNumber - 1)
      if (!jsdoc) {
        return // Skip steps without JSDoc
      }

      // Extract parameters
      const parameters: StepParameter[] = []
      if (t.isFunction(funcArg) && funcArg.params) {
        let order = 0
        for (const param of funcArg.params) {
          // Skip 'this: CustomWorld' parameter
          if (t.isIdentifier(param) && param.name === 'this') {
            continue
          }
          if (t.isObjectPattern(param) && param.properties.length === 1) {
            const prop = param.properties[0]
            if (t.isObjectProperty(prop) && t.isIdentifier(prop.key) && prop.key.name === 'this') {
              continue
            }
          }

          let paramName: string | null = null
          let paramType: string | null = null

          if (t.isIdentifier(param)) {
            paramName = param.name
            if (param.typeAnnotation && t.isTSTypeAnnotation(param.typeAnnotation)) {
              const typeAnnotation = param.typeAnnotation.typeAnnotation
              if (t.isTSTypeReference(typeAnnotation) && t.isIdentifier(typeAnnotation.typeName)) {
                paramType = typeAnnotation.typeName.name
              } else if (t.isTSStringKeyword(typeAnnotation)) {
                paramType = 'string'
              } else if (t.isTSNumberKeyword(typeAnnotation)) {
                paramType = 'number'
              } else if (t.isTSBooleanKeyword(typeAnnotation)) {
                paramType = 'boolean'
              }
            }
          } else if (t.isObjectPattern(param)) {
            // Handle destructured parameters (unlikely but possible)
            continue
          }

          if (paramName && paramType) {
            try {
              const mappedType = mapTypeToParameterType(paramType)
              parameters.push({
                name: paramName,
                type: mappedType,
                order: order++,
              })
            } catch (error) {
              throw new Error(`Error mapping parameter type in step "${signature}": ${error}`)
            }
          }
        }
      }

      // Extract function definition
      const functionDefinition = extractFunctionDefinition(node, keyword, content)

      steps.push({
        jsdoc,
        signature,
        functionDefinition,
        parameters,
        keyword,
      })
    },
  })

  return {
    group,
    steps,
    filePath,
  }
}

/**
 * Scans step definition files
 */
async function scanStepFiles(baseDir: string): Promise<string[]> {
  const patterns = ['src/tests/steps/actions/**/*.step.ts', 'src/tests/steps/validations/**/*.step.ts']
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
  _baseDir: string,
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

  // Track signatures from filesystem
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
          existingStep.description !== (step.jsdoc.description || '') ||
          existingStep.signature !== step.signature ||
          existingStep.functionDefinition !== step.functionDefinition ||
          existingStep.icon !== step.jsdoc.icon ||
          existingStep.type !== stepType ||
          existingStep.templateStepGroupId !== stepGroup.id

        if (needsUpdate) {
          // Update step and parameters
          await prisma.templateStep.update({
            where: { id: existingStep.id },
            data: {
              name: step.jsdoc.name,
              description: step.jsdoc.description || '',
              signature: step.signature,
              functionDefinition: step.functionDefinition,
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
            description: step.jsdoc.description || '',
            signature: step.signature,
            functionDefinition: step.functionDefinition,
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
function generateSummary(result: SyncResult): void {
  console.log('\n📊 Sync Summary:')
  console.log(`   📁 Steps scanned: ${result.stepsScanned}`)
  console.log(`   ✅ Steps existing: ${result.stepsExisting}`)
  console.log(`   ➕ Steps created: ${result.stepsCreated}`)
  console.log(`   🔄 Steps updated: ${result.stepsUpdated}`)
  console.log(`   🗑️  Steps deleted: ${result.stepsDeleted}`)
  console.log(`   ❌ Errors: ${result.errors.length}`)

  if (result.createdSteps.length > 0) {
    console.log('\n   Created steps:')
    result.createdSteps.forEach((step, index) => {
      console.log(`      ${index + 1}. ${step.name} (${step.signature}) [${step.group}]`)
    })
  }

  if (result.updatedSteps.length > 0) {
    console.log('\n   Updated steps:')
    result.updatedSteps.forEach((step, index) => {
      console.log(`      ${index + 1}. ${step.name} (${step.signature}) [${step.group}]`)
    })
  }

  if (result.deletedSteps.length > 0) {
    console.log('\n   Deleted steps:')
    result.deletedSteps.forEach((step, index) => {
      console.log(`      ${index + 1}. ${step.name} (${step.signature}) [${step.group}]`)
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
    const result = await syncStepsToDatabase(allSteps, baseDir)

    // Add parsing errors to result
    result.errors.push(...errors)

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
