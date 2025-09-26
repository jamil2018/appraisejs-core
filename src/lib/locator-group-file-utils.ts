import { promises as fs } from 'fs'
import path from 'path'
import prisma from '@/config/db-config'
import { buildModulePath } from '@/lib/path-helpers/module-path'

/**
 * Gets the file path for a locator group based on its module hierarchy
 */
export async function getLocatorGroupFilePath(locatorGroupId: string): Promise<string | null> {
  try {
    const locatorGroup = await prisma.locatorGroup.findUnique({
      where: { id: locatorGroupId },
      include: { module: true },
    })

    if (!locatorGroup) return null

    const allModules = await prisma.module.findMany()
    const modulePath = buildModulePath(allModules, locatorGroup.module)

    const sanitizedPath = modulePath.replace(/^\//, '').replace(/\//g, path.sep)
    const fileName = `${locatorGroup.name}.json`

    return path.join('src', 'tests', 'locators', sanitizedPath, fileName)
  } catch (error) {
    console.error('Error getting locator group file path:', error)
    return null
  }
}

/**
 * Generates JSON content for a locator group from its locators
 */
export async function generateLocatorGroupContent(locatorGroupId: string): Promise<Record<string, string>> {
  try {
    const locatorGroup = await prisma.locatorGroup.findUnique({
      where: { id: locatorGroupId },
      include: {
        locators: {
          select: { name: true, value: true },
        },
      },
    })

    if (!locatorGroup) return {}

    return Object.fromEntries(locatorGroup.locators.map(locator => [locator.name, locator.value]))
  } catch (error) {
    console.error('Error generating locator group content:', error)
    return {}
  }
}

/**
 * Ensures a directory exists, creating it if necessary
 */
export async function ensureDirectoryExists(filePath: string): Promise<void> {
  const dir = path.dirname(filePath)
  try {
    await fs.access(dir)
  } catch {
    await fs.mkdir(dir, { recursive: true })
  }
}

/**
 * Creates or updates a locator group JSON file
 */
export async function createOrUpdateLocatorGroupFile(locatorGroupId: string): Promise<boolean> {
  try {
    const filePath = await getLocatorGroupFilePath(locatorGroupId)
    if (!filePath) return false

    await ensureDirectoryExists(filePath)
    const content = await generateLocatorGroupContent(locatorGroupId)

    await fs.writeFile(filePath, JSON.stringify(content, null, 2))
    return true
  } catch (error) {
    console.error('Error creating/updating locator group file:', error)
    return false
  }
}

/**
 * Deletes a locator group JSON file and cleans up empty directories
 */
export async function deleteLocatorGroupFile(locatorGroupId: string): Promise<boolean> {
  try {
    const filePath = await getLocatorGroupFilePath(locatorGroupId)
    if (!filePath) return false

    // Check if file exists before trying to delete
    try {
      await fs.access(filePath)
    } catch {
      return true // File doesn't exist, nothing to delete
    }

    await fs.unlink(filePath)
    await cleanupEmptyDirectories(filePath)
    return true
  } catch (error) {
    console.error('Error deleting locator group file:', error)
    return false
  }
}

/**
 * Renames a locator group file when the name changes
 */
export async function renameLocatorGroupFile(
  oldLocatorGroupId: string,
  newName: string,
  oldName?: string,
): Promise<boolean> {
  try {
    // Get the current file path (with new name) for the directory
    const currentFilePath = await getLocatorGroupFilePath(oldLocatorGroupId)
    if (!currentFilePath) return false

    // If oldName is provided, construct the old file path manually
    // Otherwise, try to get it from the current path (fallback)
    let oldFilePath: string
    if (oldName) {
      oldFilePath = path.join(path.dirname(currentFilePath), `${oldName}.json`)
    } else {
      oldFilePath = currentFilePath
    }

    const newFilePath = path.join(path.dirname(currentFilePath), `${newName}.json`)

    try {
      await fs.access(oldFilePath)
      console.log('oldFilePath exists:', oldFilePath)
      await fs.rename(oldFilePath, newFilePath)
      console.log('File renamed successfully from', oldFilePath, 'to', newFilePath)
    } catch (error) {
      console.log('File not found at old path, creating new one:', error)
      // File doesn't exist, create new one
      return await createOrUpdateLocatorGroupFile(oldLocatorGroupId)
    }

    return true
  } catch (error) {
    console.error('Error renaming locator group file:', error)
    return false
  }
}

/**
 * Moves a locator group file when the module changes
 */
export async function moveLocatorGroupFile(locatorGroupId: string): Promise<boolean> {
  try {
    // Delete old file and create new one in correct location
    await deleteLocatorGroupFile(locatorGroupId)
    return await createOrUpdateLocatorGroupFile(locatorGroupId)
  } catch (error) {
    console.error('Error moving locator group file:', error)
    return false
  }
}

/**
 * Cleans up empty directories recursively
 */
async function cleanupEmptyDirectories(filePath: string): Promise<void> {
  let currentDir = path.dirname(filePath)

  while (currentDir !== 'tests' && currentDir !== '.') {
    try {
      const files = await fs.readdir(currentDir)
      if (files.length === 0) {
        await fs.rmdir(currentDir)
        currentDir = path.dirname(currentDir)
      } else {
        break
      }
    } catch {
      break
    }
  }
}

/**
 * Creates an empty JSON file for a new locator group
 */
export async function createEmptyLocatorGroupFile(locatorGroupId: string): Promise<boolean> {
  try {
    const filePath = await getLocatorGroupFilePath(locatorGroupId)
    if (!filePath) return false

    await ensureDirectoryExists(filePath)
    await fs.writeFile(filePath, JSON.stringify({}, null, 2))
    return true
  } catch (error) {
    console.error('Error creating empty locator group file:', error)
    return false
  }
}

/**
 * Reads and parses the content of a locator group file
 */
export async function readLocatorGroupFile(
  locatorGroupId: string,
): Promise<{ filePath: string; content: Record<string, string> } | null> {
  try {
    const filePath = await getLocatorGroupFilePath(locatorGroupId)
    if (!filePath) return null

    const fileContent = await fs.readFile(filePath, 'utf-8')
    const jsonContent = JSON.parse(fileContent)

    return { filePath, content: jsonContent }
  } catch (error) {
    console.error('Error reading locator group file:', error)
    return null
  }
}
