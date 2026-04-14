import path from 'path'
import { existsSync, promises as fs } from 'fs'
import type { TemplateId } from './template-catalog.js'

export interface TemplateMetadata {
  preparedAt: string
  inputHash: string
  databasePath: string
}

export interface TemplateStepDataCounts {
  stepCount: number
  stepGroupCount: number
}

export const TEMPLATE_PREP_SYNC_SCRIPTS = ['sync-template-step-groups', 'sync-template-steps'] as const
export const BLANK_TEMPLATE_PREP_SYNC_SCRIPTS = ['sync-template-steps', 'sync-template-step-groups'] as const

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

export function getTemplatePrepSyncScripts(template: TemplateId): readonly string[] {
  return template === 'blank' ? BLANK_TEMPLATE_PREP_SYNC_SCRIPTS : TEMPLATE_PREP_SYNC_SCRIPTS
}

export async function readTemplateStepDataCounts(databasePath: string): Promise<TemplateStepDataCounts> {
  const { PrismaClient } = await import('@prisma/client')
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: `file:${databasePath}`,
      },
    },
  })

  try {
    const [stepCount, stepGroupCount] = await prisma.$transaction([
      prisma.templateStep.count(),
      prisma.templateStepGroup.count(),
    ])
    return { stepCount, stepGroupCount }
  } finally {
    await prisma.$disconnect()
  }
}

export async function verifyPreparedTemplateState(
  packageTemplateDir: string,
  template: TemplateId,
  collectFilesFn: typeof collectFiles = collectFiles,
  readTemplateStepDataCountsFn: (databasePath: string) => Promise<TemplateStepDataCounts> = readTemplateStepDataCounts,
): Promise<void> {
  const seededDbPath = path.join(packageTemplateDir, 'prisma', 'dev.db')
  const staleNestedDbPath = path.join(packageTemplateDir, 'prisma', 'prisma', 'dev.db')
  const packagedGitignorePath = path.join(packageTemplateDir, 'gitignore')
  const packageEnvPath = path.join(packageTemplateDir, '.env')
  const starterEnvironmentPath = path.join(
    packageTemplateDir,
    'automation',
    'config',
    'environments',
    'environments.json',
  )
  const starterLocatorMapPath = path.join(packageTemplateDir, 'automation', 'mapping', 'locator-map.json')
  const reportsDir = path.join(packageTemplateDir, 'automation', 'reports')
  const reportFiles = existsSync(reportsDir) ? await collectFilesFn(reportsDir) : []
  const bundledStepsDir = path.join(packageTemplateDir, 'automation', 'steps')
  const bundledStepFiles = existsSync(bundledStepsDir)
    ? await collectFilesFn(bundledStepsDir, relativePath => relativePath.endsWith('.step.ts'))
    : []
  const strayOsArtifacts = await collectFilesFn(
    packageTemplateDir,
    relativePath => path.basename(relativePath) === '.DS_Store',
  )

  if (!existsSync(seededDbPath)) {
    throw new Error(`Prepared template is missing ${seededDbPath}`)
  }
  if (existsSync(staleNestedDbPath)) {
    throw new Error(`Prepared template still contains stale nested database ${staleNestedDbPath}`)
  }
  if (!existsSync(packagedGitignorePath)) {
    throw new Error(`Prepared template is missing packaged gitignore ${packagedGitignorePath}`)
  }
  if (existsSync(packageEnvPath)) {
    throw new Error(`Prepared template should not include ${packageEnvPath}`)
  }
  if (!existsSync(starterEnvironmentPath)) {
    throw new Error(`Prepared template is missing starter environments file ${starterEnvironmentPath}`)
  }
  if (!existsSync(starterLocatorMapPath)) {
    throw new Error(`Prepared template is missing locator map ${starterLocatorMapPath}`)
  }
  const starterLocatorMap = await fs.readFile(starterLocatorMapPath, 'utf8')
  const parsedStarterLocatorMap = JSON.parse(starterLocatorMap) as unknown
  if (!Array.isArray(parsedStarterLocatorMap) || parsedStarterLocatorMap.length > 0) {
    throw new Error(`Prepared template should include an empty locator map at ${starterLocatorMapPath}`)
  }
  if (reportFiles.length > 0) {
    throw new Error(`Prepared template should not include report artifacts, found ${reportFiles.join(', ')}`)
  }
  if (strayOsArtifacts.length > 0) {
    throw new Error(`Prepared template should not include OS artifacts, found ${strayOsArtifacts.join(', ')}`)
  }

  const stepDataCounts = await readTemplateStepDataCountsFn(seededDbPath)

  if (template === 'starter') {
    if (bundledStepFiles.length === 0) {
      throw new Error(`Prepared starter template is missing bundled step files in ${bundledStepsDir}`)
    }
    if (stepDataCounts.stepCount === 0 || stepDataCounts.stepGroupCount === 0) {
      throw new Error(`Prepared starter template database should include bundled step data at ${seededDbPath}`)
    }
    return
  }

  if (bundledStepFiles.length > 0) {
    throw new Error(`Prepared blank template should not include bundled step files, found ${bundledStepFiles.join(', ')}`)
  }
  if (stepDataCounts.stepCount !== 0 || stepDataCounts.stepGroupCount !== 0) {
    throw new Error(`Prepared blank template database should not include bundled step data at ${seededDbPath}`)
  }
}
