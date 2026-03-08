#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, '..', '..', '..')
const source = join(repoRoot, 'templates', 'default')
const dest = join(__dirname, '..', 'templates', 'default')

function copyDir(sourceDir: string, destDir: string): void {
  mkdirSync(destDir, { recursive: true })

  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = join(sourceDir, entry.name)
    const destPath = join(destDir, entry.name)

    if (entry.isDirectory()) {
      copyDir(sourcePath, destPath)
      continue
    }

    cpSync(sourcePath, destPath, { force: true })
  }
}

function resetAutomationReports(templateRoot: string): void {
  const reportsRoot = join(templateRoot, 'automation', 'reports')
  rmSync(reportsRoot, { recursive: true, force: true })
  mkdirSync(join(reportsRoot, 'logs'), { recursive: true })
  mkdirSync(join(reportsRoot, 'traces'), { recursive: true })
}

if (!existsSync(source)) {
  console.error('Source template not found:', source)
  process.exit(1)
}

const readmePath = join(dest, 'README.md')
const appraisejsConfigPath = join(dest, 'appraisejs.config.json')
const savedReadme = existsSync(readmePath) ? readFileSync(readmePath, 'utf8') : null
const savedAppraisejsConfig = existsSync(appraisejsConfigPath)
  ? readFileSync(appraisejsConfigPath, 'utf8')
  : null

rmSync(dest, { recursive: true, force: true })
mkdirSync(dest, { recursive: true })
copyDir(source, dest)

resetAutomationReports(dest)
rmSync(join(dest, '.env'), { force: true })
rmSync(join(dest, 'prisma', 'prisma'), { recursive: true, force: true })

if (savedReadme) {
  writeFileSync(readmePath, savedReadme)
  console.log('Restored README.md')
}
if (savedAppraisejsConfig) {
  writeFileSync(appraisejsConfigPath, savedAppraisejsConfig)
  console.log('Restored appraisejs.config.json')
}

console.log('Synced templates/default to packages/create-appraisejs/templates/default')
