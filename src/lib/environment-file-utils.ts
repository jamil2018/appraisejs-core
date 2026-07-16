import { promises as fs } from 'fs'
import * as path from 'path'
import prisma from '@/config/db-config'
import { getAutomationEnvironmentsDir } from '@/lib/automation/automation-path-roots'
import { ensureAutomationWorkspaceReady } from '@/lib/automation/automation-workspace'

interface EnvironmentConfig {
  baseUrl: string
  apiBaseUrl: string
  email: string
  passwordEnvironmentVariable: string
}

type ProjectableEnvironment = {
  baseUrl: string
  apiBaseUrl: string | null
  username: string | null
  passwordEnvironmentVariable: string | null
}

const EMPTY_ENVIRONMENTS_FILE_CONTENT = '{}\n'

function getEnvironmentsFilePath(): string {
  return path.join(getAutomationEnvironmentsDir(), 'environments.json')
}

async function ensureConfigDirectoryExists(): Promise<void> {
  await ensureAutomationWorkspaceReady()
  await fs.mkdir(path.dirname(getEnvironmentsFilePath()), { recursive: true })
}

async function generateEnvironmentsContent(): Promise<Record<string, EnvironmentConfig>> {
  try {
    const environments = await prisma.environment.findMany({
      orderBy: { createdAt: 'asc' },
    })

    const environmentsConfig: Record<string, EnvironmentConfig> = {}

    environments.forEach(env => {
      const envKey = env.name.toLowerCase().replace(/\s+/g, '_')
      environmentsConfig[envKey] = projectEnvironmentConfig(env)
    })

    return environmentsConfig
  } catch (error) {
    console.error('Error generating environments content:', error)
    return {}
  }
}

export function projectEnvironmentConfig(environment: ProjectableEnvironment): EnvironmentConfig {
  return {
    baseUrl: environment.baseUrl,
    apiBaseUrl: environment.apiBaseUrl || '',
    email: environment.username || '',
    passwordEnvironmentVariable: environment.passwordEnvironmentVariable || '',
  }
}

export async function createOrUpdateEnvironmentsFile(): Promise<boolean> {
  try {
    await ensureAutomationWorkspaceReady()
    const filePath = getEnvironmentsFilePath()
    await ensureConfigDirectoryExists()

    const content = await generateEnvironmentsContent()

    if (Object.keys(content).length === 0) {
      await fs.writeFile(filePath, EMPTY_ENVIRONMENTS_FILE_CONTENT)
      return true
    }

    await fs.writeFile(filePath, JSON.stringify(content, null, 2))
    return true
  } catch (error) {
    console.error('Error creating/updating environments file:', error)
    return false
  }
}
