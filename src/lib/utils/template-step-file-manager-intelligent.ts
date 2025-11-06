import { promises as fs } from 'fs'
import { TemplateStep, TemplateStepGroupType } from '@prisma/client'
import { ensureStepsDirectory, getFilePath, formatFileContent } from './template-step-file-generator'

/**
 * Checks if a template step update requires file changes
 * Only signature and parameter changes require file updates
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

  // No file changes needed for other updates
  return false
}

/**
 * Finds the start and end lines of a step definition function in the file
 * Uses flexible signature matching to handle prettier formatting variations
 */
function findStepFunctionBounds(content: string, signature: string): { startLine: number; endLine: number } | null {
  const lines = content.split('\n')

  // Search for the signature content across multiple lines (handles prettier formatting)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Check if this line starts a step definition
    if (line.trim().startsWith('When(') || line.trim().startsWith('Then(')) {
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
        // Found the start, now find the end using bracket counting
        let braceCount = 0
        let startBraceFound = false

        for (let j = i; j < lines.length; j++) {
          const currentLine = lines[j]

          // Count opening braces
          for (const char of currentLine) {
            if (char === '{') {
              braceCount++
              startBraceFound = true
            } else if (char === '}') {
              braceCount--
            }
          }

          // If we found the opening brace and closed all braces, we're done
          if (startBraceFound && braceCount === 0) {
            return { startLine: i, endLine: j }
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
 * Ensures required imports are present in the file content
 */
function ensureRequiredImports(content: string): string {
  const requiredImports = `import { When } from '@cucumber/cucumber';
import { CustomWorld } from '../../config/executor/world';
import { SelectorName } from '@/types/locator/locator.type';
import { resolveLocator } from '../../utils/locator.util';

`

  // Check if imports are already present
  if (content.includes("import { When } from '@cucumber/cucumber'")) {
    return content
  }

  // Add imports at the beginning
  return requiredImports + content
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
      // Replace existing step - only replace the signature line
      const lines = existingContent.split('\n')
      const beforeStep = lines.slice(0, bounds.startLine).join('\n')
      const afterStep = lines.slice(bounds.startLine + 1).join('\n')

      // Replace only the signature line, keep the rest of the function
      const newSignatureLine = `When('${templateStep.signature}',`
      newContent = beforeStep + '\n' + newSignatureLine + '\n' + afterStep
    } else {
      // Add new step at the end
      const newStepDefinition = templateStep.functionDefinition || ''
      newContent = existingContent + (existingContent ? '\n\n' : '') + newStepDefinition
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
      // Update existing step - replace the entire function
      const lines = existingContent.split('\n')
      const beforeStep = lines.slice(0, bounds.startLine).join('\n')
      const afterStep = lines.slice(bounds.endLine + 1).join('\n')

      const newStepDefinition = templateStep.functionDefinition || ''
      const newContent = beforeStep + '\n' + newStepDefinition + '\n' + afterStep

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
): Promise<void> {
  try {
    await ensureStepsDirectory()
    const filePath = getFilePath(groupName, type)

    const placeholderContent = ensureRequiredImports(
      '// This file is generated automatically. Add template steps to this group to generate content.',
    )

    await fs.writeFile(filePath, placeholderContent, 'utf8')

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
 * Preserves all existing content
 * If type changed, moves file from old folder to new folder
 */
export async function renameTemplateStepGroupFile(
  oldGroupName: string,
  newGroupName: string,
  oldType: TemplateStepGroupType | string,
  newType: TemplateStepGroupType | string,
): Promise<void> {
  try {
    await ensureStepsDirectory()
    const oldFilePath = getFilePath(oldGroupName, oldType)
    const newFilePath = getFilePath(newGroupName, newType)

    try {
      // Read the existing file content
      const existingContent = await fs.readFile(oldFilePath, 'utf8')

      // Write the content to the new file
      await fs.writeFile(newFilePath, existingContent, 'utf8')

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
