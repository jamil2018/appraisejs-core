import { promises as fs } from 'fs'
import { TemplateStep, TemplateStepGroupType } from '@prisma/client'
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

  // Look through the JSDoc block (should end within first few lines)
  for (let i = 0; i < lines.length && i < 10; i++) {
    const line = lines[i].trim()

    if (line === '*/') {
      // Found end of JSDoc
      endLine = i
      break
    } else if (line.startsWith('* @type') || line.startsWith('*@type')) {
      // Found @type - this is group metadata (steps have @icon, not @type)
      hasType = true
    }
  }

  // If we found a JSDoc block at the top with @type, return its bounds
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
 * Generates JSDoc comments for a template step
 */
function generateJSDocComment(templateStep: TemplateStep): string {
  const lines = ['/**']
  lines.push(` * @name ${templateStep.name}`)
  if (templateStep.description) {
    lines.push(` * @description ${templateStep.description}`)
  }
  lines.push(` * @icon ${templateStep.icon}`)
  lines.push(' */')
  return lines.join('\n')
}

/**
 * Wraps a function definition with JSDoc comments
 * If the function already has JSDoc comments, replaces them
 */
function wrapFunctionWithJSDoc(functionDefinition: string, templateStep: TemplateStep): string {
  const jsdoc = generateJSDocComment(templateStep)

  // Remove existing JSDoc comments if present
  const cleanedDefinition = functionDefinition.replace(/\/\*\*[\s\S]*?\*\/\s*/g, '').trim()

  // Prepend JSDoc and return
  return `${jsdoc}\n${cleanedDefinition}`
}

/**
 * Checks if a template step update requires file changes
 * Signature, parameter, and metadata (name, description, icon) changes require file updates
 */
function requiresFileUpdate(oldStep: TemplateStep, newStep: TemplateStep): boolean {
  // Check if signature changed
  if (oldStep.signature !== newStep.signature) {
    return true
  }

  // Check if function definition changed (this includes parameter changes)
  if (oldStep.functionDefinition !== newStep.functionDefinition) {
    return true
  }

  // Check if metadata changed (name, description, icon) - these affect JSDoc comments
  if (oldStep.name !== newStep.name) {
    return true
  }

  if (oldStep.description !== newStep.description) {
    return true
  }

  if (oldStep.icon !== newStep.icon) {
    return true
  }

  // No file changes needed for other updates
  return false
}

/**
 * Finds the start and end lines of a step definition function in the file
 * Uses flexible signature matching to handle prettier formatting variations
 * Handles JSDoc comments that may precede the function
 */
function findStepFunctionBounds(content: string, signature: string): { startLine: number; endLine: number } | null {
  const lines = content.split('\n')

  // Search for the signature content across multiple lines (handles prettier formatting)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmedLine = line.trim()

    // Skip JSDoc comment lines (but not the function definition itself)
    if (
      trimmedLine.startsWith('/**') ||
      trimmedLine === '*/' ||
      (trimmedLine.startsWith('*') && !trimmedLine.startsWith('When(') && !trimmedLine.startsWith('Then('))
    ) {
      continue
    }

    // Check if this line starts a step definition
    if (trimmedLine.startsWith('When(') || trimmedLine.startsWith('Then(')) {
      // Look ahead to find the complete signature across multiple lines
      let signatureFound = false
      let currentSignature = ''

      // Collect signature content from current and following lines until we hit the function start
      for (let j = i; j < lines.length; j++) {
        const currentLine = lines[j]
        currentSignature += currentLine

        // Check if we've found our signature
        if (currentSignature.includes(signature)) {
          signatureFound = true
          break
        }

        // If we hit the function opening brace, stop looking for signature
        if (currentLine.includes('async function') || currentLine.includes('function(')) {
          break
        }
      }

      if (signatureFound) {
        // Found the start, now find the end using bracket and parenthesis counting
        // Also check backwards for JSDoc comments to include them in the bounds
        let functionStartLine = i
        let braceCount = 0
        let parenCount = 0
        let startParenFound = false

        // Check if there are JSDoc comments before this function
        if (i > 0) {
          let jsdocStart = i - 1
          // Look backwards for JSDoc comment block
          // First, check if the previous line is the end of a JSDoc block
          if (lines[jsdocStart].trim() === '*/') {
            // Found end of JSDoc, continue looking backwards for the start
            jsdocStart--
            while (jsdocStart >= 0) {
              const prevLine = lines[jsdocStart].trim()
              if (prevLine.startsWith('/**')) {
                // Found start of JSDoc block
                functionStartLine = jsdocStart
                break
              } else if (prevLine.startsWith('*') || prevLine === '') {
                jsdocStart--
              } else {
                break
              }
            }
          }
        }

        for (let j = i; j < lines.length; j++) {
          const currentLine = lines[j]

          // Count opening and closing parentheses and braces
          for (const char of currentLine) {
            if (char === '(') {
              parenCount++
              startParenFound = true
            } else if (char === ')') {
              parenCount--
            } else if (char === '{') {
              braceCount++
            } else if (char === '}') {
              braceCount--
            }
          }

          // If we found the opening parenthesis and both parentheses and braces are balanced, we're done
          // This ensures we capture the complete When(...) or Then(...) call including the closing )
          if (startParenFound && parenCount === 0 && braceCount === 0) {
            return { startLine: functionStartLine, endLine: j }
          }
        }

        // If we reach here, something went wrong with bracket counting
        console.warn(`Could not find end of function for signature: ${signature}`)
        return null
      }
    }
  }

  return null
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
    module: '@cucumber/cucumber',
    namedExports: ['When'],
    from: '@cucumber/cucumber',
  },
  {
    module: '../../config/executor/world',
    namedExports: ['CustomWorld'],
    from: '../../config/executor/world.js',
  },
  {
    module: '@/types/locator/locator.type',
    namedExports: ['SelectorName'],
    from: '@/types/locator/locator.type',
  },
  {
    module: '../../utils/locator.util',
    namedExports: ['resolveLocator'],
    from: '../../utils/locator.util.js',
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
 * Intelligently adds a new template step to the file
 * Preserves existing content including imports, types, and other code
 */
export async function addTemplateStepToFile(
  groupName: string,
  templateStep: TemplateStep,
  type: TemplateStepGroupType | string,
): Promise<void> {
  try {
    await ensureStepsDirectory()
    const filePath = getFilePath(groupName, type)

    let existingContent = ''
    try {
      existingContent = await fs.readFile(filePath, 'utf8')
    } catch {
      // File doesn't exist, start with empty content
      existingContent = ''
    }

    // Ensure required imports are present
    existingContent = ensureRequiredImports(existingContent)

    // Check if step with this signature already exists
    const bounds = findStepFunctionBounds(existingContent, templateStep.signature)

    let newContent: string

    if (bounds) {
      // Replace existing step - replace the entire function with JSDoc comments
      const lines = existingContent.split('\n')
      const beforeStep = lines.slice(0, bounds.startLine).join('\n')
      const afterStep = lines.slice(bounds.endLine + 1).join('\n')

      // Wrap the function definition with JSDoc comments
      const wrappedStepDefinition = wrapFunctionWithJSDoc(templateStep.functionDefinition || '', templateStep)
      newContent =
        beforeStep +
        (beforeStep.trim() ? '\n\n' : '') +
        wrappedStepDefinition +
        (afterStep.trim() ? '\n' : '') +
        afterStep
    } else {
      // Add new step at the end - wrap with JSDoc comments
      const wrappedStepDefinition = wrapFunctionWithJSDoc(templateStep.functionDefinition || '', templateStep)
      newContent = existingContent + (existingContent ? '\n\n' : '') + wrappedStepDefinition
    }

    // Format and write the file
    const formattedContent = await formatFileContent(newContent)
    await fs.writeFile(filePath, formattedContent, 'utf8')

    console.log(`Template step added to file: ${filePath}`)
  } catch (error) {
    console.error(`Failed to add template step to file for group "${groupName}":`, error)
    throw new Error(`File update failed: ${error}`)
  }
}

/**
 * Intelligently removes a template step from the file
 * Only removes the specific step, preserves everything else including imports and types
 */
export async function removeTemplateStepFromFile(
  groupName: string,
  templateStep: TemplateStep,
  type: TemplateStepGroupType | string,
): Promise<void> {
  try {
    await ensureStepsDirectory()
    const filePath = getFilePath(groupName, type)

    let existingContent = ''
    try {
      existingContent = await fs.readFile(filePath, 'utf8')
    } catch {
      // File doesn't exist, nothing to remove
      return
    }

    // Ensure required imports are present
    existingContent = ensureRequiredImports(existingContent)

    // Find the step to remove
    const bounds = findStepFunctionBounds(existingContent, templateStep.signature)

    if (!bounds) {
      // Step not found, nothing to remove
      return
    }

    // Remove the entire function block
    const lines = existingContent.split('\n')
    const beforeStep = lines.slice(0, bounds.startLine).join('\n')
    const afterStep = lines.slice(bounds.endLine + 1).join('\n')

    // Combine content, handling empty sections
    let newContent = ''
    if (beforeStep.trim()) {
      newContent += beforeStep.trim()
    }
    if (afterStep.trim()) {
      if (newContent) newContent += '\n'
      newContent += afterStep.trim()
    }

    // Format and write the file
    const formattedContent = await formatFileContent(newContent)
    await fs.writeFile(filePath, formattedContent, 'utf8')

    console.log(`Template step removed from file: ${filePath}`)
  } catch (error) {
    console.error(`Failed to remove template step from file for group "${groupName}":`, error)
    throw new Error(`File update failed: ${error}`)
  }
}

/**
 * Intelligently updates a template step in the file
 * Only updates the specific step, preserves everything else including imports and types
 */
export async function updateTemplateStepInFile(
  groupName: string,
  templateStep: TemplateStep,
  type: TemplateStepGroupType | string,
  oldStep?: TemplateStep,
): Promise<void> {
  try {
    // If we have the old step data, check if file changes are needed
    if (oldStep && !requiresFileUpdate(oldStep, templateStep)) {
      console.log(`No file changes needed for template step update: ${templateStep.signature}`)
      return
    }

    await ensureStepsDirectory()
    const filePath = getFilePath(groupName, type)

    let existingContent = ''
    try {
      existingContent = await fs.readFile(filePath, 'utf8')
    } catch {
      // File doesn't exist, create it with the updated step
      await addTemplateStepToFile(groupName, templateStep, type)
      return
    }

    // Ensure required imports are present
    existingContent = ensureRequiredImports(existingContent)

    // Find the step to update
    const bounds = findStepFunctionBounds(existingContent, oldStep!.signature)

    if (bounds) {
      // Update existing step - replace the entire function with JSDoc comments
      const lines = existingContent.split('\n')
      const beforeStep = lines.slice(0, bounds.startLine).join('\n')
      const afterStep = lines.slice(bounds.endLine + 1).join('\n')

      // Wrap the function definition with JSDoc comments
      const wrappedStepDefinition = wrapFunctionWithJSDoc(templateStep.functionDefinition || '', templateStep)
      const newContent =
        beforeStep +
        (beforeStep.trim() ? '\n\n' : '') +
        wrappedStepDefinition +
        (afterStep.trim() ? '\n' : '') +
        afterStep

      // Format and write the file
      const formattedContent = await formatFileContent(newContent)
      await fs.writeFile(filePath, formattedContent, 'utf8')

      console.log(`Template step updated in file: ${filePath}`)
    } else {
      // Step not found, add it
      await addTemplateStepToFile(groupName, templateStep, type)
    }
  } catch (error) {
    console.error(`Failed to update template step in file for group "${groupName}":`, error)
    throw new Error(`File update failed: ${error}`)
  }
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
    const requiredImports = `import { When } from '@cucumber/cucumber';
import { CustomWorld } from '../../config/executor/world.js';
import { SelectorName } from '@/types/locator/locator.type';
import { resolveLocator } from '../../utils/locator.util.js';

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
