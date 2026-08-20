#!/usr/bin/env node
import crypto from 'crypto'
import {
  cpSync,
  createReadStream,
  existsSync,
  mkdirSync,
  promises as fs,
  readFileSync,
  readdirSync,
  rmSync,
  rmdirSync,
  writeFileSync,
} from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import { fileURLToPath, pathToFileURL } from 'url'
import {
  assertSharedTemplateDatabaseInputs,
  collectFiles,
  getTemplatePrepSyncScripts,
  shouldAbortOnFallbackSeed,
  verifyPreparedTemplateState,
  type TemplateMetadata,
} from '../src/prepare-template-utils.js'
import {
  getEmptyEnvironmentsFileContent,
  getEmptyLocatorMapFileContent,
  setSeededTemplateFilesTracked,
} from '../src/scaffold-gitignore.js'
import { getTemplateDefinition, getTemplateDefinitions, type TemplateId } from '../src/template-catalog.js'
import { isRepoOnlyTemplatePath, REPO_ONLY_TEMPLATE_SCRIPT_NAMES } from '../src/template-boundary.js'
import { shouldExcludeBundledTemplatePath } from '../src/sync-templates-utils.js'
import { shouldBackfillLegacyEnvironmentConfig, shouldExcludeTemplatePath } from '../../../src/lib/template-sync-utils'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const packageRoot = path.join(__dirname, '..')
const repoRoot = path.join(packageRoot, '..', '..')
const packageTemplatesDir = path.join(packageRoot, 'templates')
const baseTemplateDir = path.join(packageTemplatesDir, 'base')
const flavorsDir = path.join(packageTemplatesDir, 'flavors')
const tempWorkspaceDir = path.join(repoRoot, '.tmp', 'create-appraisejs-template-build')
const tempWorkspaceRootDir = path.dirname(tempWorkspaceDir)
const composedVerifyDir = path.join(repoRoot, '.tmp', 'create-appraisejs-template-verify')
const templateMetaPath = path.join(baseTemplateDir, '.appraise-template-meta.json')
const RELEASE_ONLY_SCRIPTS = new Set([
  'check-generic-planning-boundary.mjs',
  'check-release-readiness.mjs',
  'lib/release-readiness.mjs',
  'lib/release-readiness.test.ts',
])

type InternalPackageSyncConfig = {
  name: string
  directories: string[]
}

const INTERNAL_PACKAGES: InternalPackageSyncConfig[] = [
  { name: 'cucumber-runtime', directories: ['src'] },
  { name: 'locator-picker-companion', directories: ['src', 'dist'] },
]

function getPackageFlavorDir(template: TemplateId): string {
  return path.join(flavorsDir, getTemplateDefinition(template).flavorDirectory)
}

function getTsxCliPath(): string {
  return path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs')
}

function getTsNodeLoaderPath(): string {
  return path.join(repoRoot, 'node_modules', 'ts-node', 'esm.mjs')
}

function getPrismaCliPath(): string {
  return path.join(repoRoot, 'node_modules', 'prisma', 'build', 'index.js')
}

function getSeedDatabaseCandidates(): string[] {
  return [path.join(repoRoot, 'prisma', 'dev.db'), path.join(repoRoot, 'prisma', 'prisma', 'dev.db')]
}

function copyFile(src: string, dest: string): void {
  mkdirSync(path.dirname(dest), { recursive: true })
  cpSync(src, dest, { force: true })
}

function copyDirWithFilter(
  src: string,
  dest: string,
  options: { base?: string; shouldExcludePath?: (relativePath: string) => boolean } = {},
): void {
  if (!existsSync(src)) return

  const { base = src, shouldExcludePath = shouldExcludeTemplatePath } = options
  mkdirSync(dest, { recursive: true })

  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name)
    const relativePath = path.relative(base, srcPath).replace(/\\/g, '/')
    if (shouldExcludePath(relativePath)) continue

    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDirWithFilter(srcPath, destPath, { base, shouldExcludePath })
      continue
    }

    cpSync(srcPath, destPath, { force: true })
  }
}

async function runProcess(command: string, args: string[], cwd: string, env?: NodeJS.ProcessEnv): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        ...env,
      },
      stdio: 'inherit',
    })

    child.on('error', reject)
    child.on('close', code => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`))
    })
  })
}

async function runTypeScriptScript(scriptPath: string, cwd: string): Promise<void> {
  try {
    await runProcess(process.execPath, [getTsxCliPath(), scriptPath], cwd, {
      TSX_TSCONFIG_PATH: path.join(cwd, 'tsconfig.json'),
    })
    return
  } catch (error) {
    console.warn(`tsx execution failed for ${scriptPath}, falling back to ts-node.`)
    console.warn(error instanceof Error ? error.message : String(error))
  }

  await runProcess(
    process.execPath,
    ['--loader', pathToFileURL(getTsNodeLoaderPath()).href, '--experimental-specifier-resolution=node', scriptPath],
    cwd,
    {
      TS_NODE_PROJECT: path.join(cwd, 'tsconfig.json'),
      TS_NODE_TRANSPILE_ONLY: 'true',
    },
  )
}

async function runPrismaMigrateDeploy(cwd: string): Promise<void> {
  await runProcess(
    process.execPath,
    [getPrismaCliPath(), 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'],
    cwd,
    {
      PRISMA_HIDE_UPDATE_MESSAGE: '1',
    },
  )
}

async function removeLegacyTemplateTargetProject(databasePath: string): Promise<void> {
  const { PrismaClient } = await import('@prisma/client')
  const prisma = new PrismaClient({
    datasources: { db: { url: `file:${databasePath}` } },
  })

  try {
    await prisma.targetProject.deleteMany({
      where: { id: '00000000-0000-4000-8000-000000000001' },
    })
  } finally {
    await prisma.$disconnect()
  }
}

async function hashFile(filePath: string): Promise<Buffer> {
  const hash = crypto.createHash('sha256')
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath)
    stream.on('data', chunk => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve())
  })
  return hash.digest()
}

async function computeTemplateInputHash(): Promise<string> {
  const inputFiles = new Set<string>()

  for (const file of await collectFiles(
    path.join(repoRoot, 'automation'),
    relativePath => !relativePath.startsWith('reports/'),
  )) {
    inputFiles.add(file)
  }

  for (const file of await collectFiles(path.join(repoRoot, 'scripts'), relativePath => {
    const baseName = path.basename(relativePath)
    return baseName.startsWith('sync-') || baseName === 'setup-env.ts' || baseName === 'protect-seeded-files.ts'
  })) {
    inputFiles.add(file)
  }

  ;[path.join(repoRoot, 'prisma', 'schema.prisma'), path.join(packageRoot, 'scripts', 'prepare-template.ts')].forEach(
    file => inputFiles.add(file),
  )

  const hash = crypto.createHash('sha256')
  for (const file of Array.from(inputFiles).sort()) {
    hash.update(path.relative(repoRoot, file).replace(/\\/g, '/'))
    hash.update('\0')
    hash.update(await hashFile(file))
    hash.update('\0')
  }

  return hash.digest('hex')
}

async function readExistingTemplateMetadata(): Promise<TemplateMetadata | null> {
  if (!existsSync(templateMetaPath)) {
    return null
  }

  const raw = await fs.readFile(templateMetaPath, 'utf8')
  return JSON.parse(raw) as TemplateMetadata
}

async function writeTemplateMetadata(inputHash: string, previousMetadata: TemplateMetadata | null): Promise<void> {
  const metadata: TemplateMetadata = {
    preparedAt:
      previousMetadata?.inputHash === inputHash && previousMetadata.databasePath === 'prisma/dev.db'
        ? previousMetadata.preparedAt
        : new Date().toISOString(),
    inputHash,
    databasePath: 'prisma/dev.db',
  }

  await fs.writeFile(templateMetaPath, JSON.stringify(metadata, null, 2) + '\n')
}

function copyFallbackSeedDatabase(targetDbPath: string): void {
  const sourceDb = getSeedDatabaseCandidates().find(candidate => existsSync(candidate))
  if (!sourceDb) {
    throw new Error('No fallback seed database was found in prisma/dev.db or prisma/prisma/dev.db')
  }

  cpSync(sourceDb, targetDbPath, { force: true })
}

async function runTemplateSyncScripts(template: TemplateId, cwd: string): Promise<void> {
  for (const script of getTemplatePrepSyncScripts(template)) {
    await runTypeScriptScript(path.join('scripts', `${script}.ts`), cwd)
  }
}

async function seedDatabaseForWorkspace(template: TemplateId): Promise<boolean> {
  try {
    await runPrismaMigrateDeploy(tempWorkspaceDir)
  } catch (error) {
    console.warn('Prisma migrate deploy failed during template prep, falling back to the repo seed database.')
    console.warn(error instanceof Error ? error.message : String(error))
    copyFallbackSeedDatabase(path.join(tempWorkspaceDir, 'prisma', 'dev.db'))
    await runTemplateSyncScripts(template, tempWorkspaceDir)
    return true
  }

  await runTemplateSyncScripts(template, tempWorkspaceDir)
  return false
}

function resetAutomationReports(templateRoot: string): void {
  const reportsRoot = path.join(templateRoot, 'automation', 'reports')
  rmSync(reportsRoot, { recursive: true, force: true })
  mkdirSync(path.join(reportsRoot, 'logs'), { recursive: true })
  mkdirSync(path.join(reportsRoot, 'traces'), { recursive: true })
}

function resetAutomationLocatorMap(templateRoot: string): void {
  const locatorMapPath = path.join(templateRoot, 'automation', 'mapping', 'locator-map.json')
  mkdirSync(path.dirname(locatorMapPath), { recursive: true })
  writeFileSync(locatorMapPath, getEmptyLocatorMapFileContent())
}

function resetAutomationEnvironments(templateRoot: string): void {
  const environmentsPath = path.join(templateRoot, 'automation', 'config', 'environments', 'environments.json')
  mkdirSync(path.dirname(environmentsPath), { recursive: true })
  writeFileSync(environmentsPath, getEmptyEnvironmentsFileContent())
}

function syncLegacyEnvironmentConfig(): void {
  const legacyEnvironmentsDir = path.join(repoRoot, 'src', 'tests', 'config', 'environments')
  const targetEnvironmentsDir = path.join(baseTemplateDir, 'automation', 'config', 'environments')
  const targetEnvironmentsFile = path.join(targetEnvironmentsDir, 'environments.json')

  if (!shouldBackfillLegacyEnvironmentConfig(existsSync(targetEnvironmentsFile), existsSync(legacyEnvironmentsDir))) {
    return
  }

  mkdirSync(targetEnvironmentsDir, { recursive: true })
  cpSync(legacyEnvironmentsDir, targetEnvironmentsDir, { recursive: true, force: true })
  console.log('Backfilled automation/config/environments from legacy src/tests config.')
}

function syncInternalPackage({ name, directories }: InternalPackageSyncConfig): void {
  const internalPackageRoot = path.join(repoRoot, 'packages', name)
  const packageTarget = path.join(baseTemplateDir, 'packages', name)

  rmSync(packageTarget, { recursive: true, force: true })
  mkdirSync(packageTarget, { recursive: true })

  copyFile(path.join(internalPackageRoot, 'package.json'), path.join(packageTarget, 'package.json'))
  copyFile(path.join(internalPackageRoot, 'tsconfig.json'), path.join(packageTarget, 'tsconfig.json'))

  const shouldExcludeInternalPackagePath = (relativePath: string): boolean => {
    if (relativePath === 'dist' || relativePath.startsWith('dist/')) {
      return false
    }

    return shouldExcludeTemplatePath(relativePath)
  }

  for (const directory of directories) {
    copyDirWithFilter(path.join(internalPackageRoot, directory), path.join(packageTarget, directory), {
      base: internalPackageRoot,
      shouldExcludePath: shouldExcludeInternalPackagePath,
    })
  }
}

function writeTemplatePackageJson(): void {
  const rootPkg = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>
    [key: string]: unknown
  }
  rootPkg.scripts = {
    ...rootPkg.scripts,
    build: 'npm run build:local',
    'build:local':
      'npm run generate-db-client && npm run build:cucumber-runtime && npm run build:locator-picker-companion && next build',
    start: 'node scripts/start-local.mjs start',
    'generate-db-client': 'npx prisma generate --schema prisma/schema.prisma',
    'migrate-db': 'npx prisma migrate deploy',
    'install-playwright': 'npx playwright install',
    setup: 'npm run install-dependencies && npm run setup:db && npm run build:local && npm run protect-seeded-files',
    'setup:db':
      'npm run setup-env && npm run generate-db-client && npm run migrate-db && npm run sync-step-definitions',
    'setup:full':
      'npm run install-dependencies && npm run setup:db && npm run build:local && npm run protect-seeded-files',
    'protect-seeded-files': 'npx tsx scripts/protect-seeded-files.ts',
    'appraisejs:setup': 'npm run setup',
    'appraisejs:sync': 'npm run sync-step-definitions',
  }
  for (const scriptName of Object.keys(rootPkg.scripts)) {
    if (scriptName.startsWith('release:')) delete rootPkg.scripts[scriptName]
  }
  for (const scriptName of REPO_ONLY_TEMPLATE_SCRIPT_NAMES) {
    delete rootPkg.scripts[scriptName]
  }
  rootPkg.scripts['check:harness'] = 'node scripts/check-agent-harness.mjs'
  delete rootPkg.scripts['build:appraisejs']
  delete rootPkg.scripts['build-step-registry']
  writeFileSync(path.join(baseTemplateDir, 'package.json'), JSON.stringify(rootPkg, null, 2) + '\n')
}

function writeTemplateHarnessCheck(): void {
  copyFile(
    path.join(packageRoot, 'scripts', 'template-check-agent-harness.mjs'),
    path.join(baseTemplateDir, 'scripts', 'check-agent-harness.mjs'),
  )
}

function preparePackagedGitignore(): void {
  const gitignorePath = path.join(baseTemplateDir, '.gitignore')
  const packagedGitignorePath = path.join(baseTemplateDir, 'gitignore')
  if (!existsSync(gitignorePath) && !existsSync(packagedGitignorePath)) return

  const gitignore = readFileSync(existsSync(gitignorePath) ? gitignorePath : packagedGitignorePath, 'utf8')
  writeFileSync(packagedGitignorePath, setSeededTemplateFilesTracked(gitignore, true))
  rmSync(gitignorePath, { force: true })
}

function createBaseTemplate(): void {
  rmSync(packageTemplatesDir, { recursive: true, force: true })
  mkdirSync(baseTemplateDir, { recursive: true })

  console.log('Copying src/...')
  copyDirWithFilter(path.join(repoRoot, 'src'), path.join(baseTemplateDir, 'src'))

  console.log('Copying automation/...')
  copyDirWithFilter(path.join(repoRoot, 'automation'), path.join(baseTemplateDir, 'automation'), {
    base: repoRoot,
    shouldExcludePath: relativePath =>
      shouldExcludeTemplatePath(relativePath) || shouldExcludeBundledTemplatePath(relativePath),
  })
  syncLegacyEnvironmentConfig()
  resetAutomationReports(baseTemplateDir)
  resetAutomationLocatorMap(baseTemplateDir)
  resetAutomationEnvironments(baseTemplateDir)

  for (const internalPackage of INTERNAL_PACKAGES) {
    console.log(`Copying internal package ${internalPackage.name}...`)
    syncInternalPackage(internalPackage)
  }

  console.log('Copying prisma/...')
  copyDirWithFilter(path.join(repoRoot, 'prisma'), path.join(baseTemplateDir, 'prisma'))
  console.log('Copying public/...')
  copyDirWithFilter(path.join(repoRoot, 'public'), path.join(baseTemplateDir, 'public'))
  console.log('Copying scripts/...')
  copyDirWithFilter(path.join(repoRoot, 'scripts'), path.join(baseTemplateDir, 'scripts'), {
    shouldExcludePath: relativePath =>
      shouldExcludeTemplatePath(relativePath) ||
      RELEASE_ONLY_SCRIPTS.has(relativePath.replace(/\\/g, '/')) ||
      isRepoOnlyTemplatePath(path.posix.join('scripts', relativePath.replace(/\\/g, '/'))),
  })
  rmSync(path.join(baseTemplateDir, 'scripts', 'tests'), { recursive: true, force: true })
  console.log('Copying e2e/...')
  copyDirWithFilter(path.join(repoRoot, 'e2e'), path.join(baseTemplateDir, 'e2e'))
  console.log('Copying config/...')
  copyDirWithFilter(path.join(repoRoot, 'config'), path.join(baseTemplateDir, 'config'))

  const legacyTestsRoot = path.join(baseTemplateDir, 'src', 'tests')
  rmSync(legacyTestsRoot, { recursive: true, force: true })

  const configFiles = [
    '.gitattributes',
    '.gitconfig.appraise',
    '.editorconfig',
    '.fallowrc.json',
    '.prettierrc',
    '.gitignore',
    'eslint.config.mjs',
    'tailwind.config.ts',
    'tsconfig.json',
    'postcss.config.mjs',
    'components.json',
    'next.config.ts',
    'next-env.d.ts',
    'playwright.config.ts',
    '.env.example',
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    'bun.lockb',
  ]
  for (const name of configFiles) {
    const src = path.join(repoRoot, name)
    if (existsSync(src)) {
      copyFile(src, path.join(baseTemplateDir, name))
    }
  }

  const cucumberSource = path.join(repoRoot, 'cucumber.mjs')
  if (existsSync(cucumberSource)) {
    copyFile(cucumberSource, path.join(baseTemplateDir, 'cucumber.mjs'))
  }

  const vscodeSource = path.join(repoRoot, '.vscode')
  if (existsSync(vscodeSource)) {
    cpSync(vscodeSource, path.join(baseTemplateDir, '.vscode'), { recursive: true, force: true })
  }

  writeTemplatePackageJson()
  writeTemplateHarnessCheck()
  preparePackagedGitignore()
  rmSync(path.join(baseTemplateDir, '.env'), { force: true })
  rmSync(path.join(baseTemplateDir, 'prisma', 'dev.db'), { force: true })
  rmSync(path.join(baseTemplateDir, 'prisma', 'prisma'), { recursive: true, force: true })
  rmSync(path.join(baseTemplateDir, 'automation', 'steps'), { recursive: true, force: true })

  console.log('Created package base template.')
}

function copyDirWithoutBundledExclusions(sourceDir: string, destDir: string): void {
  copyDirWithFilter(sourceDir, destDir, {
    shouldExcludePath: relativePath => shouldExcludeBundledTemplatePath(relativePath),
  })
}

function copyStarterOverlayFiles(): void {
  const starterFlavorDir = getPackageFlavorDir('starter')
  const sourceStepsDir = path.join(repoRoot, 'automation', 'steps')
  const destStepsDir = path.join(starterFlavorDir, 'automation', 'steps')
  if (existsSync(sourceStepsDir)) {
    copyDirWithoutBundledExclusions(sourceStepsDir, destStepsDir)
  }
}

function resetFlavorDir(template: TemplateId): void {
  const flavorDir = getPackageFlavorDir(template)
  rmSync(flavorDir, { recursive: true, force: true })
  mkdirSync(path.join(flavorDir, 'prisma'), { recursive: true })
}

async function seedTemplateDatabases(
  templates: readonly TemplateId[],
  inputHash: string,
  previousMetadata: TemplateMetadata | null,
): Promise<void> {
  const template = assertSharedTemplateDatabaseInputs(templates)
  rmSync(tempWorkspaceDir, { recursive: true, force: true })
  mkdirSync(tempWorkspaceRootDir, { recursive: true })
  cpSync(baseTemplateDir, tempWorkspaceDir, { recursive: true, force: true })
  rmSync(path.join(tempWorkspaceDir, '.env'), { force: true })
  rmSync(path.join(tempWorkspaceDir, 'prisma', 'dev.db'), { force: true })
  rmSync(path.join(tempWorkspaceDir, 'prisma', 'prisma'), { recursive: true, force: true })
  await fs.writeFile(path.join(tempWorkspaceDir, 'prisma', 'dev.db'), '')
  await fs.writeFile(
    path.join(tempWorkspaceDir, '.env'),
    '# Database configuration for local development\nDATABASE_URL="file:./dev.db"\n',
  )

  let usedFallbackSeed: boolean
  try {
    usedFallbackSeed = await seedDatabaseForWorkspace(template)
  } catch (error) {
    console.warn('Template DB resync failed, falling back to the repo seed database.')
    console.warn(error instanceof Error ? error.message : String(error))
    copyFallbackSeedDatabase(path.join(tempWorkspaceDir, 'prisma', 'dev.db'))
    usedFallbackSeed = true
  }

  if (shouldAbortOnFallbackSeed(usedFallbackSeed, inputHash, previousMetadata)) {
    throw new Error(
      'Template inputs changed but the seeded database could not be regenerated. Run the template prep flow in an environment that can execute Prisma and sync scripts, then retry publish.',
    )
  }

  const seededDbPath = path.join(tempWorkspaceDir, 'prisma', 'dev.db')
  if (!existsSync(seededDbPath)) {
    throw new Error(`Seeded template database was not created at ${seededDbPath}`)
  }
  await removeLegacyTemplateTargetProject(seededDbPath)

  for (const targetTemplate of templates) {
    cpSync(seededDbPath, path.join(getPackageFlavorDir(targetTemplate), 'prisma', 'dev.db'), { force: true })
  }
}

function composeTemplateForVerification(template: TemplateId): string {
  const composedDir = path.join(composedVerifyDir, template)
  rmSync(composedDir, { recursive: true, force: true })
  mkdirSync(composedDir, { recursive: true })
  cpSync(baseTemplateDir, composedDir, { recursive: true, force: true })
  copyDirWithFilter(getPackageFlavorDir(template), composedDir, {
    shouldExcludePath: shouldExcludeBundledTemplatePath,
  })
  return composedDir
}

function cleanupTempWorkspace(): void {
  rmSync(tempWorkspaceDir, { recursive: true, force: true })
  rmSync(composedVerifyDir, { recursive: true, force: true })

  try {
    rmdirSync(tempWorkspaceRootDir)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== 'ENOENT' && code !== 'ENOTEMPTY') {
      throw error
    }
  }
}

async function main(): Promise<void> {
  const inputHash = await computeTemplateInputHash()
  const previousMetadata = await readExistingTemplateMetadata()

  try {
    createBaseTemplate()

    for (const template of getTemplateDefinitions().map(definition => definition.id)) {
      resetFlavorDir(template)
    }
    copyStarterOverlayFiles()

    const templates = getTemplateDefinitions().map(definition => definition.id)
    await seedTemplateDatabases(templates, inputHash, previousMetadata)

    for (const template of getTemplateDefinitions().map(definition => definition.id)) {
      await verifyPreparedTemplateState(composeTemplateForVerification(template), template)
    }

    await writeTemplateMetadata(inputHash, previousMetadata)
  } finally {
    cleanupTempWorkspace()
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
