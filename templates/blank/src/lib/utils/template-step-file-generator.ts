import { promises as fs } from 'fs'
import { join } from 'path'
import prettier from 'prettier'
import { TemplateStep, TemplateStepGroupType } from '@prisma/client'
import {
  getAutomationActionStepsDir,
  getAutomationStepsDir,
  getAutomationValidationStepsDir,
} from '@/lib/automation/automation-path-roots'
import { ensureAutomationWorkspaceReady } from '@/lib/automation/automation-workspace'

const RUNTIME_IMPORT = '../../../packages/cucumber-runtime/src/index.js'
const REQUIRED_RUNTIME_IMPORT = `import { When, Then, CustomWorld, expect, SelectorName, resolveLocator, getEnvironment, generateRandomData, RandomDataType } from '${RUNTIME_IMPORT}';\n\n`

function generateStepJSDoc(templateStep: Pick<TemplateStep, 'name' | 'description' | 'icon'>): string {
  const lines = ['/**']
  lines.push(` * @name ${templateStep.name}`)
  if (templateStep.description) {
    lines.push(` * @description ${templateStep.description}`)
  }
  lines.push(` * @icon ${templateStep.icon}`)
  lines.push(' */')
  return lines.join('\n')
}

function stripLeadingJSDoc(functionDefinition: string): string {
  return functionDefinition.replace(/^\s*\/\*\*[\s\S]*?\*\/\s*/u, '').trim()
}

function generateStepDefinition(templateStep: TemplateStep): string | null {
  const functionDefinition = templateStep.functionDefinition?.trim()
  if (!functionDefinition) {
    return null
  }

  return `${generateStepJSDoc(templateStep)}\n${stripLeadingJSDoc(functionDefinition)}`
}

function sanitizeFileName(groupName: string): string {
  return groupName
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
}

export function generateFileContent(templateSteps: TemplateStep[]): string {
  if (!templateSteps || templateSteps.length === 0) {
    return (
      REQUIRED_RUNTIME_IMPORT +
      '// This file is generated automatically. Add template steps to this group to generate content.'
    )
  }

  const functionDefinitions = templateSteps
    .map(generateStepDefinition)
    .filter((definition): definition is string => Boolean(definition))
    .join('\n\n')

  return REQUIRED_RUNTIME_IMPORT + functionDefinitions
}

export async function formatFileContent(content: string): Promise<string> {
  try {
    return await prettier.format(content, {
      parser: 'typescript',
      semi: true,
      singleQuote: true,
      trailingComma: 'es5',
      printWidth: 80,
      tabWidth: 2,
    })
  } catch (error) {
    console.error('Prettier formatting failed:', error)
    return content
  }
}

function getSubdirectoryName(type: TemplateStepGroupType | string): string {
  const typeStr = String(type)
  return typeStr === 'ACTION' ? 'actions' : 'validations'
}

export async function ensureStepsDirectory(): Promise<string> {
  await ensureAutomationWorkspaceReady()
  const stepsDir = getAutomationStepsDir()
  await fs.mkdir(stepsDir, { recursive: true })
  await fs.mkdir(getAutomationActionStepsDir(), { recursive: true })
  await fs.mkdir(getAutomationValidationStepsDir(), { recursive: true })
  return stepsDir
}

export function getFilePath(groupName: string, type: TemplateStepGroupType | string): string {
  const sanitizedName = sanitizeFileName(groupName)
  const subdirectory = getSubdirectoryName(type)
  return join(process.cwd(), 'automation', 'steps', subdirectory, `${sanitizedName}.step.ts`)
}

export async function writeTemplateStepFile(
  groupName: string,
  content: string,
  type: TemplateStepGroupType | string,
): Promise<void> {
  try {
    await ensureStepsDirectory()
    const formattedContent = await formatFileContent(content)
    const filePath = getFilePath(groupName, type)
    await fs.writeFile(filePath, formattedContent, 'utf8')
  } catch (error) {
    console.error(`Failed to write template step file for group "${groupName}":`, error)
    throw new Error(`File generation failed: ${error}`)
  }
}
