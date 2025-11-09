import { promises as fs } from 'fs'
import { join } from 'path'
import prettier from 'prettier'
import { TemplateStep, TemplateStepGroupType } from '@prisma/client'

/**
 * Sanitizes a template step group name for file naming
 * Converts to kebab-case (lowercase with underscores for spaces)
 */
export function sanitizeFileName(groupName: string): string {
  return groupName
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .replace(/[^a-z0-9_]/g, '') // Remove special characters except underscores
}

/**
 * Generates the content for a template step group file
 * Concatenates all function definitions from template steps in the group
 */
export function generateFileContent(templateSteps: TemplateStep[]): string {
  // Required imports for all template step group files
  const requiredImports = `import { When } from '@cucumber/cucumber';
import { CustomWorld } from '../config/world.js';
import { SelectorName } from '@/types/locator/locator.type';
import { resolveLocator } from '../../utils/locator.util';

`

  if (!templateSteps || templateSteps.length === 0) {
    return (
      requiredImports + '// This file is generated automatically. Add template steps to this group to generate content.'
    )
  }

  // Extract and concatenate function definitions
  const functionDefinitions = templateSteps
    .map(step => step.functionDefinition)
    .filter(Boolean) // Remove undefined/null values
    .join('\n\n')

  return requiredImports + functionDefinitions
}

/**
 * Formats the file content using Prettier
 */
export async function formatFileContent(content: string): Promise<string> {
  try {
    const formattedContent = await prettier.format(content, {
      parser: 'typescript',
      semi: true,
      singleQuote: true,
      trailingComma: 'es5',
      printWidth: 80,
      tabWidth: 2,
    })
    return formattedContent
  } catch (error) {
    console.error('Prettier formatting failed:', error)
    // Return original content if formatting fails
    return content
  }
}

/**
 * Gets the subdirectory name for a given template step group type
 */
export function getSubdirectoryName(type: TemplateStepGroupType | string): string {
  const typeStr = String(type)
  return typeStr === 'ACTION' ? 'actions' : 'validations'
}

/**
 * Ensures the steps directory and subdirectories exist, creates them if they don't
 */
export async function ensureStepsDirectory(): Promise<string> {
  const stepsDir = join(process.cwd(), 'src', 'tests', 'steps')

  try {
    await fs.access(stepsDir)
  } catch {
    // Directory doesn't exist, create it
    await fs.mkdir(stepsDir, { recursive: true })
  }

  // Ensure both subdirectories exist
  const actionsDir = join(stepsDir, 'actions')
  const validationsDir = join(stepsDir, 'validations')

  try {
    await fs.access(actionsDir)
  } catch {
    await fs.mkdir(actionsDir, { recursive: true })
  }

  try {
    await fs.access(validationsDir)
  } catch {
    await fs.mkdir(validationsDir, { recursive: true })
  }

  return stepsDir
}

/**
 * Generates the full file path for a template step group
 */
export function getFilePath(groupName: string, type: TemplateStepGroupType | string): string {
  const sanitizedName = sanitizeFileName(groupName)
  const subdirectory = getSubdirectoryName(type)
  return join(process.cwd(), 'src', 'tests', 'steps', subdirectory, `${sanitizedName}.step.ts`)
}

/**
 * Writes content to a template step group file
 */
export async function writeTemplateStepFile(
  groupName: string,
  content: string,
  type: TemplateStepGroupType | string,
): Promise<void> {
  try {
    // Ensure directory exists
    await ensureStepsDirectory()

    // Format content with Prettier
    const formattedContent = await formatFileContent(content)

    // Get file path
    const filePath = getFilePath(groupName, type)

    // Write file
    await fs.writeFile(filePath, formattedContent, 'utf8')

    console.log(`Template step file generated: ${filePath}`)
  } catch (error) {
    console.error(`Failed to write template step file for group "${groupName}":`, error)
    throw new Error(`File generation failed: ${error}`)
  }
}

/**
 * Deletes a template step group file
 */
export async function deleteTemplateStepFile(groupName: string, type: TemplateStepGroupType | string): Promise<void> {
  try {
    const filePath = getFilePath(groupName, type)

    // Check if file exists before trying to delete
    try {
      await fs.access(filePath)
    } catch {
      // File doesn't exist, nothing to delete
      return
    }

    // Delete file
    await fs.unlink(filePath)

    console.log(`Template step file deleted: ${filePath}`)
  } catch (error) {
    console.error(`Failed to delete template step file for group "${groupName}":`, error)
    throw new Error(`File deletion failed: ${error}`)
  }
}
