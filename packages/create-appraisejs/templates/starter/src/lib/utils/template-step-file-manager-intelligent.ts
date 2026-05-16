import { promises as fs } from 'fs'
import { TemplateStepGroupType } from '@prisma/client'
import { ensureStepsDirectory, getFilePath, formatFileContent } from './template-step-file-generator'

/**
 * Generates JSDoc comments for a template step group
 */
function generateGroupJSDocComment(
  name: string,
  description: string | null,
  type: TemplateStepGroupType | string,
): string {
  const lines = ['/**']
  lines.push(` * @name ${name}`)
  if (description) {
    lines.push(` * @description ${description}`)
  }
  lines.push(` * @type ${type}`)
  lines.push(' */')
  return lines.join('\n')
}

/**
 * Extracts the bounds of the group JSDoc comment block at the top of the file
 * Returns null if no group JSDoc is found
 * Group JSDoc must be at the very top (line 0) and contain @type (which distinguishes it from step JSDoc)
 */
function extractGroupJSDocBounds(content: string): { startLine: number; endLine: number } | null {
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

  for (let i = 0; i < lines.length && i < 10; i++) {
    const line = lines[i].trim()

    if (line === '*/') {
      endLine = i
      break
    } else if (line.startsWith('* @type') || line.startsWith('*@type')) {
      hasType = true
    }
  }

  if (hasType && endLine >= 0) {
    return { startLine: 0, endLine }
  }

  return null
}

/**
 * Ensures group JSDoc exists and is up-to-date at the top of the file
 * Preserves all other content including imports and template steps
 */
export function ensureGroupJSDoc(
  content: string,
  name: string,
  description: string | null,
  type: TemplateStepGroupType | string,
): string {
  const jsdocBounds = extractGroupJSDocBounds(content)
  const newJSDoc = generateGroupJSDocComment(name, description, type)

  if (jsdocBounds) {
    // Replace existing group JSDoc
    const lines = content.split('\n')
    const afterJSDoc = lines.slice(jsdocBounds.endLine + 1).join('\n')

    // Combine: new JSDoc + content after old JSDoc
    // Handle spacing - ensure there's proper spacing after JSDoc
    if (afterJSDoc.trim()) {
      return `${newJSDoc}\n${afterJSDoc.trimStart()}`
    }
    return `${newJSDoc}\n${afterJSDoc}`
  } else {
    // No existing group JSDoc, add it at the very top
    if (content.trim()) {
      return `${newJSDoc}\n${content.trimStart()}`
    }
    return `${newJSDoc}\n${content}`
  }
}

/**
 * Required import definitions
 */
interface RequiredImport {
  module: string
  namedExports: string[]
  from: string
}

const REQUIRED_IMPORTS: RequiredImport[] = [
  {
    module: '../../../packages/cucumber-runtime/src/index',
    namedExports: ['When', 'Then', 'CustomWorld', 'expect', 'SelectorName', 'resolveLocator', 'getEnvironment', 'generateRandomData', 'RandomDataType'],
    from: '../../../packages/cucumber-runtime/src/index.js',
  },
]

/**
 * Parses import statements from file content
 * Returns an array of import objects with their line numbers
 */
interface ParsedImport {
  line: number
  fullLine: string
  namedExports: string[]
  from: string
}

function parseImports(content: string): ParsedImport[] {
  const lines = content.split('\n')
  const imports: ParsedImport[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    // Match import statements: import { ... } from '...'
    const importMatch = line.match(/^import\s+{([^}]+)}\s+from\s+['"]([^'"]+)['"];?$/)
    if (importMatch) {
      const namedExportsStr = importMatch[1]
      const fromPath = importMatch[2]
      // Parse named exports, handling whitespace
      const namedExports = namedExportsStr
        .split(',')
        .map(exp => exp.trim())
        .filter(Boolean)

      imports.push({
        line: i,
        fullLine: line,
        namedExports,
        from: fromPath,
      })
    }
  }

  return imports
}

/**
 * Checks if a required import is present in the parsed imports
 * Handles variations like with/without .js extension, different import styles
 */
function hasRequiredImport(parsedImports: ParsedImport[], required: RequiredImport): boolean {
  for (const parsed of parsedImports) {
    // Normalize paths for comparison (remove .js extension if present)
    const normalizedParsedFrom = parsed.from.replace(/\.js$/, '')
    const normalizedRequiredFrom = required.from.replace(/\.js$/, '')

    // Check if the module path matches (with or without .js)
    if (normalizedParsedFrom === normalizedRequiredFrom || parsed.from === required.from) {
      // Check if all required named exports are present
      const hasAllExports = required.namedExports.every(exp => parsed.namedExports.includes(exp))
      if (hasAllExports) {
        return true
      }
    }
  }
  return false
}

/**
 * Generates an import statement string for a required import
 */
function generateImportStatement(required: RequiredImport): string {
  return `import { ${required.namedExports.join(', ')} } from '${required.from}';`
}

/**
 * Ensures required imports are present in the file content
 * Only adds missing imports, preserves existing imports and their order
 * Preserves group JSDoc at the top if it exists
 * @internal - exported for testing purposes
 */
export function ensureRequiredImports(content: string): string {
  // Parse existing imports
  const parsedImports = parseImports(content)

  // Check which required imports are missing
  const missingImports: RequiredImport[] = []
  for (const required of REQUIRED_IMPORTS) {
    if (!hasRequiredImport(parsedImports, required)) {
      missingImports.push(required)
    }
  }

  // If all imports are present, return content unchanged
  if (missingImports.length === 0) {
    return content
  }

  // Generate import statements for missing imports
  const newImportStatements = missingImports.map(generateImportStatement).join('\n') + '\n'

  // Check if there's a group JSDoc at the top
  const jsdocBounds = extractGroupJSDocBounds(content)

  if (jsdocBounds) {
    // Preserve JSDoc, add missing imports after it
    const lines = content.split('\n')
    const jsdoc = lines.slice(jsdocBounds.startLine, jsdocBounds.endLine + 1).join('\n')
    const afterJSDoc = lines.slice(jsdocBounds.endLine + 1).join('\n')

    // Check if there are already imports after JSDoc
    const afterJSDocTrimmed = afterJSDoc.trimStart()
    if (afterJSDocTrimmed.startsWith('import ')) {
      // Imports already exist, add missing ones right after JSDoc (before existing imports)
      // This preserves the existing import order
      return `${jsdoc}\n${newImportStatements}${afterJSDoc}`
    } else {
      // No imports after JSDoc, add them
      return `${jsdoc}\n${newImportStatements}${afterJSDocTrimmed}`
    }
  }

  // No JSDoc, check if there are existing imports
  if (parsedImports.length > 0) {
    // Find the first import line
    const firstImportLine = parsedImports[0].line
    const lines = content.split('\n')
    const beforeImports = lines.slice(0, firstImportLine).join('\n')
    const afterImports = lines.slice(firstImportLine).join('\n')
    // Add missing imports before existing imports
    return `${beforeImports}${beforeImports ? '\n' : ''}${newImportStatements}${afterImports}`
  }

  // No JSDoc, no existing imports, add imports at the beginning
  return newImportStatements + content
}

/**
 * Creates a placeholder file for a new template step group
 */
export async function createTemplateStepGroupFile(
  groupName: string,
  type: TemplateStepGroupType | string,
  description?: string | null,
): Promise<void> {
  try {
    await ensureStepsDirectory()
    const filePath = getFilePath(groupName, type)

    // Generate content with JSDoc at the top, then imports, then placeholder comment
    const groupJSDoc = generateGroupJSDocComment(groupName, description || null, type)
    const requiredImports = `import { When, Then, CustomWorld, expect, SelectorName, resolveLocator, getEnvironment, generateRandomData, RandomDataType } from '../../../packages/cucumber-runtime/src/index.js';

`
    const placeholderComment =
      '// This file is generated automatically. Add template steps to this group to generate content.'

    // Combine: JSDoc + imports + placeholder comment
    const placeholderContent = `${groupJSDoc}\n${requiredImports}${placeholderComment}`

    // Format and write the file
    const formattedContent = await formatFileContent(placeholderContent)
    await fs.writeFile(filePath, formattedContent, 'utf8')

    console.log(`Placeholder file created for template step group: ${groupName}`)
  } catch (error) {
    console.error(`Failed to create placeholder file for group "${groupName}":`, error)
    throw new Error(`File creation failed: ${error}`)
  }
}

/**
 * Deletes the file for a template step group
 */
export async function removeTemplateStepGroupFile(
  groupName: string,
  type: TemplateStepGroupType | string,
): Promise<void> {
  try {
    const filePath = getFilePath(groupName, type)

    try {
      await fs.access(filePath)
    } catch {
      // File doesn't exist, nothing to delete
      return
    }

    await fs.unlink(filePath)

    console.log(`Template step group file deleted: ${filePath}`)
  } catch (error) {
    console.error(`Failed to delete file for group "${groupName}":`, error)
    throw new Error(`File deletion failed: ${error}`)
  }
}

/**
 * Renames a template step group file when the group name or type changes
 * Preserves all existing content and updates JSDoc metadata
 * If type changed, moves file from old folder to new folder
 */
export async function renameTemplateStepGroupFile(
  oldGroupName: string,
  newGroupName: string,
  oldType: TemplateStepGroupType | string,
  newType: TemplateStepGroupType | string,
  newDescription?: string | null,
): Promise<void> {
  try {
    await ensureStepsDirectory()
    const oldFilePath = getFilePath(oldGroupName, oldType)
    const newFilePath = getFilePath(newGroupName, newType)

    try {
      // Read the existing file content
      let existingContent = await fs.readFile(oldFilePath, 'utf8')

      // Update the group JSDoc with new metadata
      existingContent = ensureGroupJSDoc(existingContent, newGroupName, newDescription || null, newType)

      // Format and write the content to the new file
      const formattedContent = await formatFileContent(existingContent)
      await fs.writeFile(newFilePath, formattedContent, 'utf8')

      // Remove the old file
      await fs.unlink(oldFilePath)

      console.log(`Template step group file renamed: ${oldFilePath} → ${newFilePath}`)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // Old file doesn't exist, which is fine
        console.log(`Old template step group file doesn't exist: ${oldFilePath}`)
      } else {
        throw error
      }
    }
  } catch (error) {
    console.error(`Failed to rename template step group file from "${oldGroupName}" to "${newGroupName}":`, error)
    throw new Error(`File rename failed: ${error}`)
  }
}
