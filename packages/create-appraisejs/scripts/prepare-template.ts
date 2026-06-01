#!/usr/bin/env node
import crypto from 'crypto'
import { cpSync, createReadStream, existsSync, mkdirSync, promises as fs, rmSync, rmdirSync } from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import { fileURLToPath, pathToFileURL } from 'url'
import {
  collectFiles,
  getTemplatePrepSyncScripts,
  shouldAbortOnFallbackSeed,
  verifyPreparedTemplateState,
  type TemplateMetadata,
} from '../src/prepare-template-utils.js'
import { getTemplateDefinition, getTemplateDefinitions, type TemplateId } from '../src/template-catalog.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const packageRoot = path.join(__dirname, '..')
const repoRoot = path.join(packageRoot, '..', '..')
const tempWorkspaceDir = path.join(repoRoot, '.tmp', 'create-appraisejs-template-build')
const tempWorkspaceRootDir = path.dirname(tempWorkspaceDir)
const templateMetaPath = path.join(repoRoot, 'templates', 'starter', '.appraise-template-meta.json')

function getRootTemplateDir(template: TemplateId): string {
  return path.join(repoRoot, 'templates', getTemplateDefinition(template).internalDirectory)
}

function getPackageTemplateDir(template: TemplateId): string {
  return path.join(packageRoot, 'templates', getTemplateDefinition(template).internalDirectory)
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

  ;[
    path.join(repoRoot, 'prisma', 'schema.prisma'),
    path.join(repoRoot, 'scripts', 'sync-appraise-base-template.ts'),
    path.join(packageRoot, 'scripts', 'sync-templates.ts'),
    path.join(packageRoot, 'scripts', 'prepare-template.ts'),
  ].forEach(file => inputFiles.add(file))

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

async function writeTemplateMetadata(inputHash: string): Promise<void> {
  const metadata: TemplateMetadata = {
    preparedAt: new Date().toISOString(),
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

async function seedTemplateDatabase(
  template: TemplateId,
  templateDir: string,
  inputHash: string,
  previousMetadata: TemplateMetadata | null,
): Promise<void> {
  rmSync(tempWorkspaceDir, { recursive: true, force: true })
  mkdirSync(tempWorkspaceRootDir, { recursive: true })
  cpSync(templateDir, tempWorkspaceDir, { recursive: true, force: true })
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

  cpSync(seededDbPath, path.join(templateDir, 'prisma', 'dev.db'), { force: true })
  rmSync(path.join(templateDir, 'prisma', 'prisma'), { recursive: true, force: true })
  rmSync(path.join(templateDir, '.env'), { force: true })
  rmSync(path.join(templateDir, 'automation', 'reports'), { recursive: true, force: true })
  mkdirSync(path.join(templateDir, 'automation', 'reports', 'logs'), { recursive: true })
  mkdirSync(path.join(templateDir, 'automation', 'reports', 'traces'), { recursive: true })
}

function createBlankRootTemplateFromStarter(): void {
  const starterTemplateDir = getRootTemplateDir('starter')
  const blankTemplateDir = getRootTemplateDir('blank')

  rmSync(blankTemplateDir, { recursive: true, force: true })
  cpSync(starterTemplateDir, blankTemplateDir, { recursive: true, force: true })
  rmSync(path.join(blankTemplateDir, 'automation', 'steps'), { recursive: true, force: true })
}

function cleanupTempWorkspace(): void {
  rmSync(tempWorkspaceDir, { recursive: true, force: true })

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
    await runTypeScriptScript(path.join('scripts', 'sync-appraise-base-template.ts'), repoRoot)
    await seedTemplateDatabase('starter', getRootTemplateDir('starter'), inputHash, previousMetadata)
    createBlankRootTemplateFromStarter()
    await seedTemplateDatabase('blank', getRootTemplateDir('blank'), inputHash, previousMetadata)
    await runTypeScriptScript(path.join('packages', 'create-appraisejs', 'scripts', 'sync-templates.ts'), repoRoot)

    for (const template of getTemplateDefinitions().map(definition => definition.id)) {
      await verifyPreparedTemplateState(getPackageTemplateDir(template), template)
    }

    await writeTemplateMetadata(inputHash)
  } finally {
    cleanupTempWorkspace()
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
