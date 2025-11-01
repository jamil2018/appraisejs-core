import { promises as fs } from 'fs'
import * as path from 'path'
import prisma from '@/config/db-config'

interface EnvironmentConfig {
  baseUrl: string
  apiBaseUrl: string
  email: string
  password: string
}

/**
 * Gets the file path for the environments.json file
 */
export function getEnvironmentsFilePath(): string {
  return path.join('src', 'tests', 'config', 'environments', 'environments.json')
}

/**
 * Ensures the config directory exists
 */
export async function ensureConfigDirectoryExists(): Promise<void> {
  const filePath = getEnvironmentsFilePath()
  const dir = path.dirname(filePath)
  try {
    await fs.access(dir)
  } catch {
    await fs.mkdir(dir, { recursive: true })
  }
}

/**
 * Generates JSON content for environments from database
 */
export async function generateEnvironmentsContent(): Promise<Record<string, EnvironmentConfig>> {
  try {
    const environments = await prisma.environment.findMany({
      orderBy: { createdAt: 'asc' },
    })

    const environmentsConfig: Record<string, EnvironmentConfig> = {}

    environments.forEach(env => {
      const envKey = env.name.toLowerCase().replace(/\s+/g, '_')
      environmentsConfig[envKey] = {
        baseUrl: env.baseUrl,
        apiBaseUrl: env.apiBaseUrl || '',
        email: env.username || '',
        password: env.password || '',
      }
    })

    return environmentsConfig
  } catch (error) {
    console.error('Error generating environments content:', error)
    return {}
  }
}

/**
 * Creates or updates the environments.json file
 */
export async function createOrUpdateEnvironmentsFile(): Promise<boolean> {
  try {
    const filePath = getEnvironmentsFilePath()
    await ensureConfigDirectoryExists()

    const content = await generateEnvironmentsContent()

    // If no environments exist, delete the file
    if (Object.keys(content).length === 0) {
      await deleteEnvironmentsFile()
      return true
    }

    await fs.writeFile(filePath, JSON.stringify(content, null, 2))
    return true
  } catch (error) {
    console.error('Error creating/updating environments file:', error)
    return false
  }
}

/**
 * Deletes the environments.json file
 */
export async function deleteEnvironmentsFile(): Promise<boolean> {
  try {
    const filePath = getEnvironmentsFilePath()

    // Check if file exists before trying to delete
    try {
      await fs.access(filePath)
    } catch {
      return true // File doesn't exist, nothing to delete
    }

    await fs.unlink(filePath)
    return true
  } catch (error) {
    console.error('Error deleting environments file:', error)
    return false
  }
}

/**
 * Reads and parses the content of the environments.json file
 */
export async function readEnvironmentsFile(): Promise<{
  filePath: string
  content: Record<string, EnvironmentConfig>
} | null> {
  try {
    const filePath = getEnvironmentsFilePath()

    try {
      await fs.access(filePath)
    } catch {
      return null // File doesn't exist
    }

    const fileContent = await fs.readFile(filePath, 'utf-8')
    const jsonContent = JSON.parse(fileContent)

    return { filePath, content: jsonContent }
  } catch (error) {
    console.error('Error reading environments file:', error)
    return null
  }
}

/**
 * Updates a specific environment entry in the environments.json file
 */
export async function updateEnvironmentEntry(environmentId: string, oldName?: string): Promise<boolean> {
  try {
    // Get the environment from database
    const environment = await prisma.environment.findUnique({
      where: { id: environmentId },
    })

    if (!environment) {
      console.error(`Environment with ID ${environmentId} not found`)
      return false
    }

    const filePath = getEnvironmentsFilePath()

    // Read existing content
    let environmentsConfig: Record<string, EnvironmentConfig> = {}
    try {
      await fs.access(filePath)
      const fileContent = await fs.readFile(filePath, 'utf-8')
      environmentsConfig = JSON.parse(fileContent)
    } catch {
      // File doesn't exist, start with empty object
    }

    // Remove old entry if name changed
    if (oldName) {
      const oldKey = oldName.toLowerCase().replace(/\s+/g, '_')
      delete environmentsConfig[oldKey]
    }

    // Add/update the environment entry
    const envKey = environment.name.toLowerCase().replace(/\s+/g, '_')
    environmentsConfig[envKey] = {
      baseUrl: environment.baseUrl,
      apiBaseUrl: environment.apiBaseUrl || '',
      email: environment.username || '',
      password: environment.password || '',
    }

    // Ensure directory exists
    await ensureConfigDirectoryExists()

    // Write updated content
    await fs.writeFile(filePath, JSON.stringify(environmentsConfig, null, 2))
    return true
  } catch (error) {
    console.error('Error updating environment entry:', error)
    return false
  }
}

/**
 * Removes a specific environment entry from the environments.json file
 */
export async function removeEnvironmentEntry(environmentName: string): Promise<boolean> {
  try {
    const filePath = getEnvironmentsFilePath()

    // Check if file exists
    try {
      await fs.access(filePath)
    } catch {
      return true // File doesn't exist, nothing to remove
    }

    // Read existing content
    const fileContent = await fs.readFile(filePath, 'utf-8')
    const environmentsConfig: Record<string, EnvironmentConfig> = JSON.parse(fileContent)

    // Remove the environment entry
    const envKey = environmentName.toLowerCase().replace(/\s+/g, '_')
    delete environmentsConfig[envKey]

    // If no environments left, delete the file
    if (Object.keys(environmentsConfig).length === 0) {
      await deleteEnvironmentsFile()
      return true
    }

    // Write updated content
    await fs.writeFile(filePath, JSON.stringify(environmentsConfig, null, 2))
    return true
  } catch (error) {
    console.error('Error removing environment entry:', error)
    return false
  }
}
