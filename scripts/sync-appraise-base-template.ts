#!/usr/bin/env node
/**
 * Sync the default template from the base app (repo root).
 * Copies src/, automation/, prisma/, public/, scripts/, the cucumber runtime package,
 * and root config files into templates/default/ while preserving template-only files.
 *
 * Usage: npx tsx scripts/sync-appraise-base-template.ts
 * Or: npm run sync-template
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, '..')
const target = join(repoRoot, 'templates', 'default')

const EXCLUDED_DIRS = new Set(['node_modules', '.next', '.git', 'dist'])
const EXCLUDED_EXTENSIONS = new Set(['.db', '.sqlite', '.sqlite3', '.tsbuildinfo'])
const EXCLUDED_PATH_PREFIXES = ['automation/reports/']

function shouldExclude(relativePath: string): boolean {
  const normalizedPath = relativePath.replace(/\\/g, '/')
  const parts = normalizedPath.split('/')

  if (parts.some(part => EXCLUDED_DIRS.has(part))) return true
  if (EXCLUDED_PATH_PREFIXES.some(prefix => normalizedPath.startsWith(prefix))) return true

  const ext = normalizedPath.endsWith('.sqlite3')
    ? '.sqlite3'
    : normalizedPath.endsWith('.sqlite')
      ? '.sqlite'
      : normalizedPath.endsWith('.tsbuildinfo')
        ? '.tsbuildinfo'
        : normalizedPath.slice(normalizedPath.lastIndexOf('.'))

  return EXCLUDED_EXTENSIONS.has(ext)
}

function copyDirWithFilter(src: string, dest: string, base = src): void {
  if (!existsSync(src)) return

  mkdirSync(dest, { recursive: true })
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcPath = join(src, entry.name)
    const relativePath = srcPath.slice(base.length + 1).replace(/\\/g, '/')
    if (shouldExclude(relativePath)) continue

    const destPath = join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDirWithFilter(srcPath, destPath, base)
      continue
    }

    cpSync(srcPath, destPath, { force: true })
  }
}

function copyFile(src: string, dest: string): void {
  mkdirSync(dirname(dest), { recursive: true })
  cpSync(src, dest, { force: true })
}

function resetAutomationReports(templateRoot: string): void {
  const reportsRoot = join(templateRoot, 'automation', 'reports')
  rmSync(reportsRoot, { recursive: true, force: true })
  mkdirSync(join(reportsRoot, 'logs'), { recursive: true })
  mkdirSync(join(reportsRoot, 'traces'), { recursive: true })
}

function syncCucumberRuntimePackage(): void {
  const runtimeTarget = join(target, 'packages', 'cucumber-runtime')
  rmSync(runtimeTarget, { recursive: true, force: true })
  mkdirSync(runtimeTarget, { recursive: true })

  copyFile(join(repoRoot, 'packages', 'cucumber-runtime', 'package.json'), join(runtimeTarget, 'package.json'))
  copyFile(join(repoRoot, 'packages', 'cucumber-runtime', 'tsconfig.json'), join(runtimeTarget, 'tsconfig.json'))
  copyDirWithFilter(join(repoRoot, 'packages', 'cucumber-runtime', 'src'), join(runtimeTarget, 'src'))
}

const readmePath = join(target, 'README.md')
const appraisejsConfigPath = join(target, 'appraisejs.config.json')
const savedReadme = existsSync(readmePath) ? readFileSync(readmePath, 'utf8') : null
const savedAppraisejsConfig = existsSync(appraisejsConfigPath)
  ? readFileSync(appraisejsConfigPath, 'utf8')
  : null

rmSync(target, { recursive: true, force: true })
mkdirSync(target, { recursive: true })

console.log('Copying src/...')
copyDirWithFilter(join(repoRoot, 'src'), join(target, 'src'))

console.log('Copying automation/...')
copyDirWithFilter(join(repoRoot, 'automation'), join(target, 'automation'))
resetAutomationReports(target)

console.log('Copying cucumber runtime package...')
syncCucumberRuntimePackage()

console.log('Copying prisma/...')
copyDirWithFilter(join(repoRoot, 'prisma'), join(target, 'prisma'))
console.log('Copying public/...')
copyDirWithFilter(join(repoRoot, 'public'), join(target, 'public'))
console.log('Copying scripts/...')
copyDirWithFilter(join(repoRoot, 'scripts'), join(target, 'scripts'))

const legacyTestsRoot = join(target, 'src', 'tests')
if (existsSync(legacyTestsRoot)) {
  rmSync(legacyTestsRoot, { recursive: true, force: true })
}

const configFiles = [
  '.gitignore',
  'eslint.config.mjs',
  'tailwind.config.ts',
  'tsconfig.json',
  'postcss.config.mjs',
  'components.json',
  'next.config.ts',
  'next-env.d.ts',
  '.env.example',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
]
for (const name of configFiles) {
  const src = join(repoRoot, name)
  if (existsSync(src)) {
    copyFile(src, join(target, name))
  }
}

const cucumberSource = join(repoRoot, 'cucumber.mjs')
if (existsSync(cucumberSource)) {
  copyFile(cucumberSource, join(target, 'cucumber.mjs'))
  console.log('Synced cucumber.mjs to template')
}

const vscodeSource = join(repoRoot, '.vscode')
if (existsSync(vscodeSource)) {
  cpSync(vscodeSource, join(target, '.vscode'), { recursive: true, force: true })
  console.log('Synced .vscode to template')
}

const rootPkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>
  [key: string]: unknown
}
rootPkg.scripts = {
  ...rootPkg.scripts,
  build: 'npm run build:local',
  'build:local': 'npm run build:cucumber-runtime && next build',
  start: 'next start',
  'migrate-db': 'npx prisma migrate deploy',
  'install-playwright': 'npx playwright install',
  setup: 'npm run install-dependencies && npm run setup-env && npm run build:local',
  'setup:db': 'npm run setup-env && npm run migrate-db && npm run sync-all',
  'setup:full': 'npm run install-dependencies && npm run setup:db && npm run build:local',
  'appraisejs:setup': 'npm run setup',
  'appraisejs:sync': 'npm run sync-all',
}
writeFileSync(join(target, 'package.json'), JSON.stringify(rootPkg, null, 2) + '\n')
console.log('Wrote template package.json with production-first scaffold scripts.')

if (savedReadme) {
  writeFileSync(readmePath, savedReadme)
  console.log('Restored README.md')
}
if (savedAppraisejsConfig) {
  writeFileSync(appraisejsConfigPath, savedAppraisejsConfig)
  console.log('Restored appraisejs.config.json')
}

console.log('Synced base app to templates/default with starter automation assets.')
