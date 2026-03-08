import { promises as fs } from 'fs'
import * as path from 'path'
import prisma from '@/config/db-config'
import { ensureAutomationWorkspaceReady, getAutomationEnvironmentsDir } from '@/lib/automation/paths'

interface EnvironmentConfig {
  baseUrl: string
  apiBaseUrl: string
  email: string
  password: string
}

export function getEnvironmentsFilePath(): string {
  return path.join(getAutomationEnvironmentsDir(), 'environments.json')
}

export async function ensureConfigDirectoryExists(): Promise<void> {
  await ensureAutomationWorkspaceReady()
  await fs.mkdir(path.dirname(getEnvironmentsFilePath()), { recursive: true })
}

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

export async function createOrUpdateEnvironmentsFile(): Promise<boolean> {
  try {
    await ensureAutomationWorkspaceReady()
    const filePath = getEnvironmentsFilePath()
    await ensureConfigDirectoryExists()

    const content = await generateEnvironmentsContent()

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

export async function deleteEnvironmentsFile(): Promise<boolean> {
  try {
    await ensureAutomationWorkspaceReady()
    const filePath = getEnvironmentsFilePath()

    try {
      await fs.access(filePath)
    } catch {
      return true
    }

    await fs.unlink(filePath)
    return true
  } catch (error) {
    console.error('Error deleting environments file:', error)
    return false
  }
}

export async function readEnvironmentsFile(): Promise<{
  filePath: string
  content: Record<string, EnvironmentConfig>
} | null> {
  try {
    await ensureAutomationWorkspaceReady()
    const filePath = getEnvironmentsFilePath()

    try {
      await fs.access(filePath)
    } catch {
      return null
    }

    const fileContent = await fs.readFile(filePath, 'utf-8')
    const jsonContent = JSON.parse(fileContent)

    return { filePath, content: jsonContent }
  } catch (error) {
    console.error('Error reading environments file:', error)
    return null
  }
}

export async function updateEnvironmentEntry(environmentId: string, oldName?: string): Promise<boolean> {
  try {
    await ensureAutomationWorkspaceReady()
    const environment = await prisma.environment.findUnique({
      where: { id: environmentId },
    })

    if (!environment) {
      console.error(`Environment with ID ${environmentId} not found`)
      return false
    }

    const filePath = getEnvironmentsFilePath()
    let environmentsConfig: Record<string, EnvironmentConfig> = {}

    try {
      await fs.access(filePath)
      const fileContent = await fs.readFile(filePath, 'utf-8')
      environmentsConfig = JSON.parse(fileContent)
    } catch {
      environmentsConfig = {}
    }

    if (oldName) {
      const oldKey = oldName.toLowerCase().replace(/\s+/g, '_')
      delete environmentsConfig[oldKey]
    }

    const envKey = environment.name.toLowerCase().replace(/\s+/g, '_')
    environmentsConfig[envKey] = {
      baseUrl: environment.baseUrl,
      apiBaseUrl: environment.apiBaseUrl || '',
      email: environment.username || '',
      password: environment.password || '',
    }

    await ensureConfigDirectoryExists()
    await fs.writeFile(filePath, JSON.stringify(environmentsConfig, null, 2))
    return true
  } catch (error) {
    console.error('Error updating environment entry:', error)
    return false
  }
}

export async function removeEnvironmentEntry(environmentName: string): Promise<boolean> {
  try {
    await ensureAutomationWorkspaceReady()
    const filePath = getEnvironmentsFilePath()

    try {
      await fs.access(filePath)
    } catch {
      return true
    }

    const fileContent = await fs.readFile(filePath, 'utf-8')
    const environmentsConfig: Record<string, EnvironmentConfig> = JSON.parse(fileContent)

    const envKey = environmentName.toLowerCase().replace(/\s+/g, '_')
    delete environmentsConfig[envKey]

    if (Object.keys(environmentsConfig).length === 0) {
      await deleteEnvironmentsFile()
      return true
    }

    await fs.writeFile(filePath, JSON.stringify(environmentsConfig, null, 2))
    return true
  } catch (error) {
    console.error('Error removing environment entry:', error)
    return false
  }
}
