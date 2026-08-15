import path from 'path'
import { existsSync, promises as fs } from 'fs'
import type { TemplateId } from './template-catalog.js'
import { isRepoOnlyTemplatePath } from './template-boundary.js'

export interface TemplateMetadata {
  preparedAt: string
  inputHash: string
  databasePath: string
}

export interface StepDefinitionDataCounts {
  stepDefinitionCount: number
  localRuntimeRowCount: number
}

export const TEMPLATE_PREP_SYNC_SCRIPTS = ['sync-step-definitions'] as const
export const BLANK_TEMPLATE_PREP_SYNC_SCRIPTS = ['sync-step-definitions'] as const

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

export function assertSharedTemplateDatabaseInputs(templates: readonly TemplateId[]): TemplateId {
  const canonical = templates[0]
  if (!canonical) throw new Error('At least one template is required to prepare the shared database.')
  const scripts = JSON.stringify(getTemplatePrepSyncScripts(canonical))
  for (const template of templates.slice(1)) {
    if (JSON.stringify(getTemplatePrepSyncScripts(template)) !== scripts) {
      throw new Error(`Template ${template} requires flavor-specific database preparation.`)
    }
  }
  return canonical
}

export async function readStepDefinitionDataCounts(databasePath: string): Promise<StepDefinitionDataCounts> {
  const { PrismaClient } = await import('@prisma/client')
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: `file:${databasePath}`,
      },
    },
  })

  try {
    const [stepDefinitionCount, runtimeCapsuleCount, assessmentCount, evidenceReceiptCount, testRunCount, reportCount] =
      await prisma.$transaction([
        prisma.stepDefinition.count(),
        prisma.runtimeCapsule.count(),
        prisma.assessment.count(),
        prisma.evidenceReceipt.count(),
        prisma.testRun.count(),
        prisma.report.count(),
      ])
    return {
      stepDefinitionCount,
      localRuntimeRowCount: runtimeCapsuleCount + assessmentCount + evidenceReceiptCount + testRunCount + reportCount,
    }
  } finally {
    await prisma.$disconnect()
  }
}

export async function verifyPreparedTemplateState(
  packageTemplateDir: string,
  template: TemplateId,
  collectFilesFn: typeof collectFiles = collectFiles,
  readStepDefinitionDataCountsFn: (
    databasePath: string,
  ) => Promise<StepDefinitionDataCounts> = readStepDefinitionDataCounts,
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
  const graphifyArtifacts = await collectFilesFn(packageTemplateDir, relativePath =>
    relativePath.split('/').includes('graphify-out'),
  )
  const repoOnlyHarnessArtifacts = await collectFilesFn(packageTemplateDir, isRepoOnlyTemplatePath)

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
  if (graphifyArtifacts.length > 0) {
    throw new Error(`Prepared template should not include Graphify artifacts, found ${graphifyArtifacts.join(', ')}`)
  }
  if (repoOnlyHarnessArtifacts.length > 0) {
    throw new Error(
      `Prepared template should not include repository-only swarm harness artifacts, found ${repoOnlyHarnessArtifacts.join(', ')}`,
    )
  }

  const stepDataCounts = await readStepDefinitionDataCountsFn(seededDbPath)
  if (stepDataCounts.localRuntimeRowCount > 0) {
    throw new Error(`Prepared template database contains local runtime state at ${seededDbPath}`)
  }

  if (template === 'starter') {
    if (bundledStepFiles.length === 0) {
      throw new Error(`Prepared starter template is missing bundled step files in ${bundledStepsDir}`)
    }
    if (stepDataCounts.stepDefinitionCount === 0) {
      throw new Error(`Prepared starter template database should include ready Step Definitions at ${seededDbPath}`)
    }
    return
  }

  if (bundledStepFiles.length > 0) {
    throw new Error(
      `Prepared blank template should not include bundled step files, found ${bundledStepFiles.join(', ')}`,
    )
  }
  if (stepDataCounts.stepDefinitionCount === 0) {
    throw new Error(`Prepared blank template database should include ready Step Definitions at ${seededDbPath}`)
  }
}
