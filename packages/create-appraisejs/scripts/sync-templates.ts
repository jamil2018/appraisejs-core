#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import {
  getEmptyEnvironmentsFileContent,
  getEmptyLocatorMapFileContent,
  setSeededTemplateFilesTracked,
} from '../src/scaffold-gitignore.js'
import { shouldExcludeBundledTemplatePath } from '../src/sync-templates-utils.js'
import { getTemplateDefinitions, type TemplateId } from '../src/template-catalog.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(__dirname, '..', '..', '..')

function copyDir(sourceDir: string, destDir: string, baseDir = sourceDir): void {
  mkdirSync(destDir, { recursive: true })

  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = join(sourceDir, entry.name)
    const destPath = join(destDir, entry.name)
    const relativePath = sourcePath.slice(baseDir.length + 1).replace(/\\/g, '/')

    if (shouldExcludeBundledTemplatePath(relativePath)) {
      continue
    }

    if (entry.isDirectory()) {
      copyDir(sourcePath, destPath, baseDir)
      continue
    }

    cpSync(sourcePath, destPath, { force: true })
  }
}

function prepareBundledTemplateFiles(templateRoot: string): void {
  const gitignorePath = join(templateRoot, '.gitignore')
  const packagedGitignorePath = join(templateRoot, 'gitignore')
  if (existsSync(gitignorePath) || existsSync(packagedGitignorePath)) {
    const gitignore = readFileSync(existsSync(gitignorePath) ? gitignorePath : packagedGitignorePath, 'utf8')
    writeFileSync(packagedGitignorePath, setSeededTemplateFilesTracked(gitignore, true))
    rmSync(gitignorePath, { force: true })
  }

  const environmentsPath = join(templateRoot, 'automation', 'config', 'environments', 'environments.json')
  mkdirSync(dirname(environmentsPath), { recursive: true })
  writeFileSync(environmentsPath, getEmptyEnvironmentsFileContent())

  const locatorMapPath = join(templateRoot, 'automation', 'mapping', 'locator-map.json')
  mkdirSync(dirname(locatorMapPath), { recursive: true })
  writeFileSync(locatorMapPath, getEmptyLocatorMapFileContent())
}

function syncTemplateVariant(template: TemplateId): void {
  const internalDirectory = getTemplateDefinitions().find(definition => definition.id === template)?.internalDirectory
  if (!internalDirectory) {
    throw new Error(`Unknown template: ${template}`)
  }

  const source = join(repoRoot, 'templates', internalDirectory)
  const dest = join(__dirname, '..', 'templates', internalDirectory)

  if (!existsSync(source)) {
    throw new Error(`Source template not found: ${source}`)
  }

  const readmePath = join(dest, 'README.md')
  const appraisejsConfigPath = join(dest, 'appraisejs.config.json')
  const savedReadme = existsSync(readmePath) ? readFileSync(readmePath, 'utf8') : null
  const savedAppraisejsConfig = existsSync(appraisejsConfigPath) ? readFileSync(appraisejsConfigPath, 'utf8') : null

  rmSync(dest, { recursive: true, force: true })
  mkdirSync(dest, { recursive: true })
  copyDir(source, dest)

  rmSync(join(dest, '.env'), { force: true })
  rmSync(join(dest, 'prisma', 'prisma'), { recursive: true, force: true })
  prepareBundledTemplateFiles(dest)

  if (savedReadme) {
    writeFileSync(readmePath, savedReadme)
    console.log(`Restored README.md for ${template}`)
  }
  if (savedAppraisejsConfig) {
    writeFileSync(appraisejsConfigPath, savedAppraisejsConfig)
    console.log(`Restored appraisejs.config.json for ${template}`)
  }

  console.log(`Synced templates/${internalDirectory} to packages/create-appraisejs/templates/${internalDirectory}`)
}

for (const template of getTemplateDefinitions().map(definition => definition.id)) {
  syncTemplateVariant(template)
}
