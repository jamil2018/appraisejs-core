import path from 'path'
import { existsSync, promises as fs } from 'fs'

export interface TemplateMetadata {
  preparedAt: string
  inputHash: string
  databasePath: string
}

export const TEMPLATE_PREP_SYNC_SCRIPTS = ['sync-template-step-groups', 'sync-template-steps'] as const

export async function collectFiles(
  dir: string,
  predicate?: (relativePath: string) => boolean,
  baseDir = dir,
): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/')

    if (entry.isDirectory()) {
      files.push(...(await collectFiles(fullPath, predicate, baseDir)))
      continue
    }

    if (!predicate || predicate(relativePath)) {
      files.push(fullPath)
    }
  }

  return files
}

export function shouldAbortOnFallbackSeed(
  usedFallbackSeed: boolean,
  inputHash: string,
  previousMetadata: TemplateMetadata | null,
): boolean {
  return usedFallbackSeed && previousMetadata?.inputHash !== inputHash
}

export async function verifyPreparedTemplateState(
  packageTemplateDir: string,
  collectFilesFn: typeof collectFiles = collectFiles,
): Promise<void> {
  const seededDbPath = path.join(packageTemplateDir, 'prisma', 'dev.db')
  const staleNestedDbPath = path.join(packageTemplateDir, 'prisma', 'prisma', 'dev.db')
  const packageEnvPath = path.join(packageTemplateDir, '.env')
  const starterFeaturePath = path.join(packageTemplateDir, 'automation', 'features', 'base', 'login.feature')
  const starterEnvironmentPath = path.join(
    packageTemplateDir,
    'automation',
    'config',
    'environments',
    'environments.json',
  )
  const starterLocatorMapPath = path.join(packageTemplateDir, 'automation', 'mapping', 'locator-map.json')
  const reportFiles = await collectFilesFn(path.join(packageTemplateDir, 'automation', 'reports'))

  if (!existsSync(seededDbPath)) {
    throw new Error(`Prepared template is missing ${seededDbPath}`)
  }
  if (existsSync(staleNestedDbPath)) {
    throw new Error(`Prepared template still contains stale nested database ${staleNestedDbPath}`)
  }
  if (existsSync(packageEnvPath)) {
    throw new Error(`Prepared template should not include ${packageEnvPath}`)
  }
  if (!existsSync(starterFeaturePath)) {
    throw new Error(`Prepared template is missing starter automation feature ${starterFeaturePath}`)
  }
  if (!existsSync(starterEnvironmentPath)) {
    throw new Error(`Prepared template is missing starter environments file ${starterEnvironmentPath}`)
  }
  if (!existsSync(starterLocatorMapPath)) {
    throw new Error(`Prepared template is missing locator map ${starterLocatorMapPath}`)
  }
  if (reportFiles.length > 0) {
    throw new Error(`Prepared template should not include report artifacts, found ${reportFiles.join(', ')}`)
  }
}
