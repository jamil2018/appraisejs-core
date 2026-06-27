import { promises as fs } from 'fs'
import path from 'path'
import {
  getAutomationConfigDir,
  getAutomationEnvironmentsDir,
  getAutomationFeaturesDir,
  getAutomationLocatorsDir,
  getAutomationMappingDir,
  getAutomationReportsDir,
  getAutomationRoot,
  getAutomationStepsDir,
  getAutomationActionStepsDir,
  getAutomationValidationStepsDir,
  getLegacyTestsRoot,
} from './automation-path-roots'

const runtimeImport =
  "import { When, Then, CustomWorld, expect, SelectorName, resolveLocator, getEnvironment, generateRandomData, RandomDataType } from '../../../packages/cucumber-runtime/src/index.js'"
const runtimeImportPattern =
  /^import\s*\{[\s\S]*?\}\s*from\s*['"]\.\.\/\.\.\/\.\.\/packages\/cucumber-runtime\/src\/index(?:\.js)?['"];?\r?\n*/gm

const mutableLegacyDirectories = ['features', 'locators', 'mapping', 'steps'] as const

let automationWorkspaceReadyPromise: Promise<void> | null = null

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

async function rewriteLegacyStepImports(): Promise<void> {
  const stepsDir = getAutomationStepsDir()

  if (!(await pathExists(stepsDir))) {
    return
  }

  const stepFiles = await fs.readdir(stepsDir, { recursive: true })
  for (const entry of stepFiles) {
    if (typeof entry !== 'string' || !entry.endsWith('.ts')) {
      continue
    }

    const filePath = path.join(stepsDir, entry)
    let content = await fs.readFile(filePath, 'utf8')

    content = content
      .replace(runtimeImportPattern, '')
      .replace(/^import \{ (When|Then) \} from '@cucumber\/cucumber';?\r?\n/gm, '')
      .replace(/^import \{ CustomWorld(?:, expect)? \} from '\.\.\/\.\.\/config\/executor\/world\.js';?\r?\n/gm, '')
      .replace(
        /^import \{ SelectorName \} from '(?:@\/types\/locator\/locator\.type|\.\.\/\.\.\/\.\.\/types\/locator\/locator\.type)';?\r?\n/gm,
        '',
      )
      .replace(/^import \{ resolveLocator \} from '\.\.\/\.\.\/utils\/locator\.util\.js';?\r?\n/gm, '')
      .replace(/^import \{ getEnvironment \} from '\.\.\/\.\.\/utils\/environment\.util\.js';?\r?\n/gm, '')
      .replace(
        /^import \{ generateRandomData, RandomDataType \} from '\.\.\/\.\.\/utils\/random-data\.util\.js';?\r?\n/gm,
        '',
      )
      .trimStart()

    content = `${runtimeImport}\n${content}`

    await fs.writeFile(filePath, content)
  }
}

async function copyLegacyMutableWorkspace(): Promise<void> {
  const legacyTestsRoot = getLegacyTestsRoot()
  const automationRoot = getAutomationRoot()
  const legacyExists = await pathExists(legacyTestsRoot)
  const automationExists = await pathExists(automationRoot)

  if (!legacyExists || automationExists) {
    return
  }

  await fs.mkdir(automationRoot, { recursive: true })

  const legacyEnvironmentsDir = path.join(legacyTestsRoot, 'config', 'environments')
  if (await pathExists(legacyEnvironmentsDir)) {
    await fs.cp(legacyEnvironmentsDir, getAutomationEnvironmentsDir(), { recursive: true })
  }

  for (const directory of mutableLegacyDirectories) {
    const sourceDirectory = path.join(legacyTestsRoot, directory)
    const destinationDirectory = path.join(automationRoot, directory)

    if (await pathExists(sourceDirectory)) {
      await fs.cp(sourceDirectory, destinationDirectory, { recursive: true })
    }
  }
}

async function copyLegacyEnvironmentsIfNeeded(): Promise<void> {
  const legacyTestsRoot = getLegacyTestsRoot()
  const legacyEnvironmentsDir = path.join(legacyTestsRoot, 'config', 'environments')
  const automationEnvironmentsFile = path.join(getAutomationEnvironmentsDir(), 'environments.json')

  if (!(await pathExists(legacyEnvironmentsDir)) || (await pathExists(automationEnvironmentsFile))) {
    return
  }

  await fs.mkdir(getAutomationEnvironmentsDir(), { recursive: true })
  await fs.cp(legacyEnvironmentsDir, getAutomationEnvironmentsDir(), { recursive: true })
}

async function ensureMutableAutomationDirectories(): Promise<void> {
  const requiredDirectories = [
    getAutomationRoot(),
    getAutomationConfigDir(),
    getAutomationEnvironmentsDir(),
    getAutomationFeaturesDir(),
    getAutomationLocatorsDir(),
    getAutomationMappingDir(),
    getAutomationReportsDir(),
    getAutomationStepsDir(),
    getAutomationActionStepsDir(),
    getAutomationValidationStepsDir(),
  ]

  await Promise.all(requiredDirectories.map(directory => fs.mkdir(directory, { recursive: true })))
}

async function removeLegacyRuntimeArtifactsFromAutomation(): Promise<void> {
  await fs.rm(path.join(getAutomationConfigDir(), 'executor'), { recursive: true, force: true })
  await fs.rm(path.join(getAutomationRoot(), 'hooks'), { recursive: true, force: true })
  await fs.rm(path.join(getAutomationRoot(), 'support'), { recursive: true, force: true })
  await fs.rm(path.join(getAutomationRoot(), 'utils'), { recursive: true, force: true })
}

export async function ensureAutomationWorkspaceReady(): Promise<void> {
  automationWorkspaceReadyPromise ??= (async () => {
    await copyLegacyMutableWorkspace()
    await copyLegacyEnvironmentsIfNeeded()
    await ensureMutableAutomationDirectories()
    await removeLegacyRuntimeArtifactsFromAutomation()
    await rewriteLegacyStepImports()
  })()

  return automationWorkspaceReadyPromise
}
