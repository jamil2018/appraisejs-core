import { promises as fs } from 'fs'
import path from 'path'
import prisma from '@/config/db-config'
import { buildModulePath } from '@/lib/path-helpers/module-path'
import { getAutomationLocatorsDir, getAutomationMappingDir } from '@/lib/automation/automation-path-roots'
import { ensureAutomationWorkspaceReady } from '@/lib/automation/automation-workspace'

export async function getLocatorGroupFilePath(locatorGroupId: string): Promise<string | null> {
  try {
    await ensureAutomationWorkspaceReady()
    const locatorGroup = await prisma.locatorGroup.findUnique({
      where: { id: locatorGroupId },
      include: { module: true },
    })

    if (!locatorGroup) {
      return null
    }

    const allModules = await prisma.module.findMany()
    const modulePath = buildModulePath(allModules, locatorGroup.module)
    const sanitizedPath = modulePath.replace(/^\//, '').replace(/\//g, path.sep)
    const fileName = `${locatorGroup.name}.json`

    return path.join(getAutomationLocatorsDir(), sanitizedPath, fileName)
  } catch (error) {
    console.error('Error getting locator group file path:', error)
    return null
  }
}

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

    if (!locatorGroup) {
      return {}
    }

    return Object.fromEntries(locatorGroup.locators.map(locator => [locator.name, locator.value]))
  } catch (error) {
    console.error('Error generating locator group content:', error)
    return {}
  }
}

export async function ensureDirectoryExists(filePath: string): Promise<void> {
  await ensureAutomationWorkspaceReady()
  await fs.mkdir(path.dirname(filePath), { recursive: true })
}

export async function createOrUpdateLocatorGroupFile(locatorGroupId: string): Promise<boolean> {
  try {
    await ensureAutomationWorkspaceReady()
    const filePath = await getLocatorGroupFilePath(locatorGroupId)
    if (!filePath) {
      return false
    }

    await ensureDirectoryExists(filePath)
    const content = await generateLocatorGroupContent(locatorGroupId)
    await fs.writeFile(filePath, JSON.stringify(content, null, 2))
    return true
  } catch (error) {
    console.error('Error creating/updating locator group file:', error)
    return false
  }
}

export async function deleteLocatorGroupFile(locatorGroupId: string, filePathOverride?: string): Promise<boolean> {
  try {
    await ensureAutomationWorkspaceReady()
    const filePath = filePathOverride ?? (await getLocatorGroupFilePath(locatorGroupId))
    if (!filePath) {
      return false
    }

    try {
      await fs.access(filePath)
    } catch {
      return true
    }

    await fs.unlink(filePath)
    await cleanupEmptyDirectories(filePath)
    return true
  } catch (error) {
    console.error('Error deleting locator group file:', error)
    return false
  }
}

export async function renameLocatorGroupFile(
  locatorGroupId: string,
  newName: string,
  oldName?: string,
): Promise<boolean> {
  try {
    await ensureAutomationWorkspaceReady()
    const currentFilePath = await getLocatorGroupFilePath(locatorGroupId)
    if (!currentFilePath) {
      return false
    }

    const oldFilePath = oldName ? path.join(path.dirname(currentFilePath), `${oldName}.json`) : currentFilePath
    const newFilePath = path.join(path.dirname(currentFilePath), `${newName}.json`)

    try {
      await fs.access(oldFilePath)
      await fs.rename(oldFilePath, newFilePath)
    } catch {
      return createOrUpdateLocatorGroupFile(locatorGroupId)
    }

    return true
  } catch (error) {
    console.error('Error renaming locator group file:', error)
    return false
  }
}

export async function moveLocatorGroupFile(locatorGroupId: string, previousFilePath?: string): Promise<boolean> {
  try {
    await ensureAutomationWorkspaceReady()
    if (previousFilePath) {
      await deleteLocatorGroupFile(locatorGroupId, previousFilePath)
    }

    return createOrUpdateLocatorGroupFile(locatorGroupId)
  } catch (error) {
    console.error('Error moving locator group file:', error)
    return false
  }
}

async function cleanupEmptyDirectories(filePath: string): Promise<void> {
  let currentDir = path.dirname(filePath)
  const locatorsRoot = getAutomationLocatorsDir()

  while (currentDir.startsWith(locatorsRoot) && currentDir !== locatorsRoot && currentDir !== path.dirname(currentDir)) {
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

export async function createEmptyLocatorGroupFile(locatorGroupId: string): Promise<boolean> {
  try {
    await ensureAutomationWorkspaceReady()
    const filePath = await getLocatorGroupFilePath(locatorGroupId)
    if (!filePath) {
      return false
    }

    await ensureDirectoryExists(filePath)
    await fs.writeFile(filePath, JSON.stringify({}, null, 2))
    return true
  } catch (error) {
    console.error('Error creating empty locator group file:', error)
    return false
  }
}

export async function readLocatorGroupFile(
  locatorGroupId: string,
): Promise<{ filePath: string; content: Record<string, string> } | null> {
  try {
    await ensureAutomationWorkspaceReady()
    const filePath = await getLocatorGroupFilePath(locatorGroupId)
    if (!filePath) {
      return null
    }

    const fileContent = await fs.readFile(filePath, 'utf-8')
    return { filePath, content: JSON.parse(fileContent) }
  } catch (error) {
    console.error('Error reading locator group file:', error)
    return null
  }
}

export async function updateLocatorMapFile(
  currentLocatorGroupRoute: string,
  newLocatorGroupRoute: string,
  currentLocatorGroupName: string,
  newLocatorGroupName: string,
): Promise<boolean>
export async function updateLocatorMapFile(newLocatorGroupName: string, newLocatorGroupRoute: string): Promise<boolean>
export async function updateLocatorMapFile(
  param1: string,
  param2: string,
  param3?: string,
  param4?: string,
): Promise<boolean> {
  try {
    await ensureAutomationWorkspaceReady()
    const locatorMapPath = path.join(getAutomationMappingDir(), 'locator-map.json')
    await ensureDirectoryExists(locatorMapPath)

    let locatorMap: Array<{ name: string; path: string }> = []

    try {
      const fileContent = await fs.readFile(locatorMapPath, 'utf-8')
      locatorMap = JSON.parse(fileContent)
    } catch {
      locatorMap = []
    }

    const isNewEntry = param3 === undefined && param4 === undefined

    if (isNewEntry) {
      const name = param1
      const route = param2
      const existingEntry = locatorMap.find(entry => entry.name === name)
      if (existingEntry) {
        console.error(`Locator group with name "${name}" already exists in locator map`)
        return false
      }

      locatorMap.push({ name, path: route })
    } else {
      const currentLocatorGroupRoute = param1
      const newLocatorGroupRoute = param2
      const currentLocatorGroupName = param3!
      const newLocatorGroupName = param4!

      const entryIndex = locatorMap.findIndex(entry => entry.name === currentLocatorGroupName)
      if (entryIndex === -1) {
        console.error(`Locator group with name "${currentLocatorGroupName}" not found in locator map`)
        return false
      }

      if (currentLocatorGroupName !== newLocatorGroupName) {
        const existingEntry = locatorMap.find(entry => entry.name === newLocatorGroupName)
        if (existingEntry) {
          console.error(`Locator group with name "${newLocatorGroupName}" already exists in locator map`)
          return false
        }
      }

      const updatedEntry = { ...locatorMap[entryIndex] }

      if (currentLocatorGroupName !== newLocatorGroupName) {
        updatedEntry.name = newLocatorGroupName
      }

      if (currentLocatorGroupRoute !== newLocatorGroupRoute) {
        updatedEntry.path = newLocatorGroupRoute
      }

      locatorMap[entryIndex] = updatedEntry
    }

    await fs.writeFile(locatorMapPath, JSON.stringify(locatorMap, null, 2))
    return true
  } catch (error) {
    console.error('Error updating locator map file:', error)
    return false
  }
}

export async function removeLocatorMapEntry(locatorGroupNames: string[]): Promise<boolean> {
  try {
    await ensureAutomationWorkspaceReady()
    const locatorMapPath = path.join(getAutomationMappingDir(), 'locator-map.json')

    try {
      await fs.access(locatorMapPath)
    } catch {
      return true
    }

    const fileContent = await fs.readFile(locatorMapPath, 'utf-8')
    let locatorMap: Array<{ name: string; path: string }> = JSON.parse(fileContent)

    const originalLength = locatorMap.length
    locatorMap = locatorMap.filter(entry => !locatorGroupNames.includes(entry.name))

    if (originalLength === locatorMap.length) {
      return true
    }

    await fs.writeFile(locatorMapPath, JSON.stringify(locatorMap, null, 2))
    return true
  } catch (error) {
    console.error('Error removing locator map entries:', error)
    return false
  }
}
