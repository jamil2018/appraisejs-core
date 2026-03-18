import { promises as fs } from 'fs'
import { join } from 'path'
import { glob } from 'glob'
import { parse } from '@babel/parser'
import * as t from '@babel/types'
import _traverse from '@babel/traverse'
import type { NodePath } from '@babel/traverse'
import {
  StepParameterType,
  TagType,
  TemplateStepGroupType,
  TemplateStepIcon,
  TemplateStepType,
} from '@prisma/client'
import prisma from '@/config/db-config'
import {
  ensureAutomationWorkspaceReady,
  getAutomationEnvironmentsDir,
  getAutomationFeaturesDir,
} from '@/lib/automation/paths'
import { extractModulePathFromFilePath, scanFeatureFiles, type ParsedFeature, type ParsedStep } from '@/lib/gherkin-parser'
import { getAllModulesWithPaths } from '@/lib/module-hierarchy-builder'
import { SYNC_ALL_REQUEST_ID, syncScriptDefinitions, type SyncRequestId, type SyncScriptId } from '@/lib/sync/sync-registry'
import { getTagTypeFromName } from '@/lib/tag-utils'
import { extractModulePathFromAutomationFile, getAutomationLocatorMapPath } from '@/lib/template-sync-utils'

const traverse = (_traverse as { default?: typeof _traverse }).default ?? _traverse

export type SyncPendingCounts = Record<SyncRequestId, number>

type EnvironmentConfig = {
  baseUrl: string
  apiBaseUrl: string
  email: string
  password: string
}

type EnvironmentData = {
  name: string
  baseUrl: string
  apiBaseUrl: string | null
  username: string | null
  password: string | null
}

type LocatorMapEntry = {
  name: string
  path: string
}

type LocatorGroupFromFs = {
  name: string
  route: string
  modulePath: string
}

type LocatorFileData = {
  groupName: string
  modulePath: string
  locators: Record<string, string>
}

type StepGroupJSDoc = {
  name: string
  description: string | null
  type: TemplateStepGroupType
}

type StepJSDoc = {
  name: string
  description: string | null
  icon: TemplateStepIcon
}

type StepParameter = {
  name: string
  type: StepParameterType
  order: number
}

type ParsedTemplateStep = {
  jsdoc: StepJSDoc
  signature: string
  functionDefinition: string
  parameters: StepParameter[]
  keyword: 'When' | 'Then' | 'Given'
}

type ParsedStepFile = {
  group: StepGroupJSDoc
  steps: ParsedTemplateStep[]
}

type TemplateStepFromFs = {
  step: ParsedTemplateStep
  groupName: string
  groupType: TemplateStepGroupType
}

type TestSuiteFromFs = {
  name: string
  description: string | null
  modulePath: string
  tags: string[]
}

type TestCaseFromFs = {
  identifierTag: string
  title: string
  description: string
  testSuiteName: string
  modulePath: string
  filterTags: string[]
  steps: ParsedStep[]
}

type ParameterMatch = {
  name: string
  value: string
  order: number
  type: StepParameterType
}

type FilesystemSnapshot = {
  environments: EnvironmentData[]
  modulePaths: Set<string>
  locatorGroups: LocatorGroupFromFs[]
  locatorFiles: LocatorFileData[]
  tagObjects: Array<{ name: string; tagExpression: string; type: TagType }>
  templateStepGroups: StepGroupJSDoc[]
  templateSteps: TemplateStepFromFs[]
  testSuites: TestSuiteFromFs[]
  testCases: TestCaseFromFs[]
}

function normalizeEnvironmentName(name: string): string {
  if (!name || name.trim() === '') {
    return name
  }

  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()
}

async function readEnvironmentsFromFile(): Promise<EnvironmentData[]> {
  const filePath = join(getAutomationEnvironmentsDir(), 'environments.json')

  try {
    const fileContent = await fs.readFile(filePath, 'utf-8')
    const jsonContent = JSON.parse(fileContent) as Record<string, EnvironmentConfig>

    return Object.entries(jsonContent).map(([key, config]) => ({
      name: normalizeEnvironmentName(key),
      baseUrl: config.baseUrl.trim(),
      apiBaseUrl: config.apiBaseUrl?.trim() ? config.apiBaseUrl.trim() : null,
      username: config.email?.trim() ? config.email.trim() : null,
      password: config.password?.trim() ? config.password.trim() : null,
    }))
  } catch (error) {
    console.error('Unable to read environments for sync counts:', error)
    return []
  }
}

function splitTagLine(tagLine: string): string[] {
  return tagLine
    .split(/\s+/)
    .filter(tag => tag.trim().startsWith('@'))
    .map(tag => tag.trim())
}

function normalizeTagExpression(tagExpression: string): string {
  return tagExpression.startsWith('@') ? tagExpression : `@${tagExpression}`
}

function extractUniqueTags(parsedFeatures: ParsedFeature[]): Set<string> {
  const uniqueTags = new Set<string>()

  for (const feature of parsedFeatures) {
    for (const tagLine of feature.tags) {
      for (const tag of splitTagLine(tagLine)) {
        uniqueTags.add(tag)
      }
    }

    for (const scenario of feature.scenarios) {
      for (const tagLine of scenario.tags) {
        for (const tag of splitTagLine(tagLine)) {
          uniqueTags.add(tag)
        }
      }
    }
  }

  return uniqueTags
}

function buildTagObjects(tagExpressions: Set<string>): Array<{ name: string; tagExpression: string; type: TagType }> {
  return Array.from(tagExpressions).map(tagExpression => {
    const name = tagExpression.startsWith('@') ? tagExpression.substring(1) : tagExpression
    return {
      name,
      tagExpression,
      type: getTagTypeFromName(name),
    }
  })
}

function buildModuleTreePaths(modulePaths: Iterable<string>): Set<string> {
  const tree = new Set<string>()

  for (const modulePath of modulePaths) {
    if (modulePath === '/') {
      tree.add('/')
      continue
    }

    const parts = modulePath.split('/').filter(Boolean)
    let currentPath = ''

    for (const part of parts) {
      currentPath += `/${part}`
      tree.add(currentPath)
    }
  }

  return tree
}

async function scanLocatorFiles(baseDir: string): Promise<string[]> {
  const files = await glob('automation/locators/**/*.json', { cwd: baseDir })
  return files.map(file => join(baseDir, file))
}

async function readLocatorMap(baseDir: string): Promise<LocatorMapEntry[]> {
  try {
    const fileContent = await fs.readFile(getAutomationLocatorMapPath(baseDir), 'utf-8')
    const locatorMap = JSON.parse(fileContent) as LocatorMapEntry[]
    return Array.isArray(locatorMap) ? locatorMap : []
  } catch {
    return []
  }
}

function extractLocatorGroupName(filePath: string): string {
  const fileName = filePath.split(/[/\\]/).pop() ?? ''
  return fileName.replace(/\.json$/, '')
}

async function readLocatorFile(filePath: string): Promise<Record<string, string>> {
  try {
    const fileContent = await fs.readFile(filePath, 'utf-8')
    const content = JSON.parse(fileContent) as Record<string, string>
    return typeof content === 'object' && content !== null ? content : {}
  } catch (error) {
    console.error(`Unable to read locator file ${filePath}:`, error)
    return {}
  }
}

function parseGroupJSDoc(content: string): StepGroupJSDoc | null {
  const lines = content.split('\n')
  let startLine = 0

  while (startLine < lines.length) {
    const line = lines[startLine].trim()
    if (line === '' || line.startsWith('import ')) {
      startLine++
      continue
    }
    break
  }

  if (startLine >= lines.length || !lines[startLine].trim().startsWith('/**')) {
    return null
  }

  let hasType = false
  let endLine = -1
  let name: string | null = null
  let description: string | null = null
  let type: string | null = null

  const maxLines = Math.min(lines.length, startLine + 50)
  for (let i = startLine; i < maxLines; i++) {
    const line = lines[i].trim()

    if (line.includes('*/')) {
      const beforeClose = line.split('*/')[0].trim()

      if (beforeClose.startsWith('* @name') || beforeClose.startsWith('*@name')) {
        const match = beforeClose.match(/@name\s+(.+)/)
        if (match) name = match[1].trim()
      } else if (beforeClose.startsWith('* @description') || beforeClose.startsWith('*@description')) {
        const match = beforeClose.match(/@description\s+(.+)/)
        if (match) description = match[1].trim() || null
      } else if (beforeClose.startsWith('* @type') || beforeClose.startsWith('*@type')) {
        const match = beforeClose.match(/@type\s+(.+)/)
        if (match) {
          hasType = true
          type = match[1].trim()
        }
      }

      endLine = i
      break
    }

    if (line.startsWith('* @name') || line.startsWith('*@name')) {
      const match = line.match(/@name\s+(.+)/)
      if (match) name = match[1].trim()
    } else if (line.startsWith('* @description') || line.startsWith('*@description')) {
      const match = line.match(/@description\s+(.+)/)
      if (match) description = match[1].trim() || null
    } else if (line.startsWith('* @type') || line.startsWith('*@type')) {
      const match = line.match(/@type\s+(.+)/)
      if (match) {
        hasType = true
        type = match[1].trim()
      }
    }
  }

  if (!hasType || endLine < 0 || !name || !type) {
    return null
  }

  const normalizedType = type.toUpperCase()
  if (normalizedType !== 'ACTION' && normalizedType !== 'VALIDATION') {
    return null
  }

  return {
    name: name.trim(),
    description: description ? description.trim() : null,
    type: normalizedType as TemplateStepGroupType,
  }
}

function parseStepJSDoc(content: string, startLine: number): StepJSDoc | null {
  const lines = content.split('\n')
  let jsdocStart = -1

  for (let i = startLine - 1; i >= 0 && i >= startLine - 20; i--) {
    const line = lines[i]?.trim()
    if (line?.includes('*/')) {
      jsdocStart = i
      for (let j = i - 1; j >= 0 && j >= i - 10; j--) {
        const previousLine = lines[j]?.trim()
        if (previousLine?.startsWith('/**')) {
          jsdocStart = j
          break
        }
      }
      break
    }

    if (line?.startsWith('/**')) {
      jsdocStart = i
      break
    }
  }

  if (jsdocStart === -1) {
    return null
  }

  let name: string | null = null
  let description: string | null = null
  let icon: string | null = null
  let foundJSDoc = false

  for (let i = jsdocStart; i < Math.min(lines.length, jsdocStart + 20); i++) {
    const line = lines[i]?.trim()

    if (line?.startsWith('/**')) {
      foundJSDoc = true
      continue
    }

    if (line?.includes('*/')) {
      const beforeClose = line.split('*/')[0].trim()
      if (beforeClose.startsWith('* @name') || beforeClose.startsWith('*@name')) {
        const match = beforeClose.match(/@name\s+(.+)/)
        if (match) name = match[1].trim()
      } else if (beforeClose.startsWith('* @description') || beforeClose.startsWith('*@description')) {
        const match = beforeClose.match(/@description\s+(.+)/)
        if (match) description = match[1].trim() || null
      } else if (beforeClose.startsWith('* @icon') || beforeClose.startsWith('*@icon')) {
        const match = beforeClose.match(/@icon\s+(.+)/)
        if (match) icon = match[1].trim()
      }
      break
    }

    if (!foundJSDoc) {
      continue
    }

    if (line?.startsWith('* @name') || line?.startsWith('*@name')) {
      const match = line.match(/@name\s+(.+)/)
      if (match) name = match[1].trim()
    } else if (line?.startsWith('* @description') || line?.startsWith('*@description')) {
      const match = line.match(/@description\s+(.+)/)
      if (match) description = match[1].trim() || null
    } else if (line?.startsWith('* @icon') || line?.startsWith('*@icon')) {
      const match = line.match(/@icon\s+(.+)/)
      if (match) icon = match[1].trim()
    }
  }

  if (!name || !icon) {
    return null
  }

  const iconUpper = icon.toUpperCase()
  const validIcons = Object.values(TemplateStepIcon)
  if (!validIcons.includes(iconUpper as TemplateStepIcon)) {
    return null
  }

  return {
    name: name.trim(),
    description: description ? description.trim() : null,
    icon: iconUpper as TemplateStepIcon,
  }
}

function mapTypeToParameterType(typeName: string): StepParameterType {
  const normalized = typeName.trim()

  if (normalized === 'SelectorName') return StepParameterType.LOCATOR
  if (normalized === 'string') return StepParameterType.STRING
  if (normalized === 'number' || normalized === 'int') return StepParameterType.NUMBER
  if (normalized === 'boolean') return StepParameterType.BOOLEAN
  if (normalized === 'Date') return StepParameterType.DATE

  throw new Error(`Unsupported parameter type: ${typeName}`)
}

function extractFunctionDefinition(callExpression: t.CallExpression, sourceCode: string): string {
  const start = callExpression.start
  const end = callExpression.end

  if (start == null || end == null) {
    throw new Error('Cannot extract function definition.')
  }

  let code = sourceCode.slice(start, end).trim()
  const trailingSource = sourceCode.slice(end, end + 10).trim()
  if (trailingSource.startsWith(';')) {
    code += ';'
  }

  return code
}

function parseStepFile(content: string): ParsedStepFile | null {
  const group = parseGroupJSDoc(content)
  if (!group) {
    return null
  }

  const ast = parse(content, {
    sourceType: 'module',
    plugins: ['typescript', 'decorators-legacy'],
  })

  const steps: ParsedTemplateStep[] = []

  traverse(ast, {
    CallExpression(path: NodePath<t.CallExpression>) {
      const node = path.node
      const callee = node.callee
      let keyword: 'When' | 'Then' | 'Given' | null = null

      if (t.isIdentifier(callee) && (callee.name === 'When' || callee.name === 'Then' || callee.name === 'Given')) {
        keyword = callee.name as 'When' | 'Then' | 'Given'
      }

      if (!keyword || node.arguments.length < 2) {
        return
      }

      const patternArg = node.arguments[0]
      const functionArg = node.arguments[1]

      if (!t.isStringLiteral(patternArg) || !t.isFunction(functionArg)) {
        return
      }

      const lineNumber = node.loc?.start?.line
      if (lineNumber == null) {
        return
      }

      const jsdoc = parseStepJSDoc(content, lineNumber - 1)
      if (!jsdoc) {
        return
      }

      const parameters: StepParameter[] = []
      let order = 0

      for (const parameter of functionArg.params) {
        if (t.isIdentifier(parameter) && parameter.name === 'this') {
          continue
        }

        if (t.isObjectPattern(parameter)) {
          continue
        }

        if (!t.isIdentifier(parameter) || !parameter.typeAnnotation || !t.isTSTypeAnnotation(parameter.typeAnnotation)) {
          continue
        }

        const annotation = parameter.typeAnnotation.typeAnnotation
        let typeName: string | null = null

        if (t.isTSTypeReference(annotation) && t.isIdentifier(annotation.typeName)) {
          typeName = annotation.typeName.name
        } else if (t.isTSStringKeyword(annotation)) {
          typeName = 'string'
        } else if (t.isTSNumberKeyword(annotation)) {
          typeName = 'number'
        } else if (t.isTSBooleanKeyword(annotation)) {
          typeName = 'boolean'
        }

        if (!typeName) {
          continue
        }

        try {
          parameters.push({
            name: parameter.name,
            type: mapTypeToParameterType(typeName),
            order: order++,
          })
        } catch {
          return
        }
      }

      steps.push({
        jsdoc,
        signature: patternArg.value,
        functionDefinition: extractFunctionDefinition(node, content),
        parameters,
        keyword,
      })
    },
  })

  return { group, steps }
}

async function scanStepFiles(baseDir: string): Promise<string[]> {
  const actionFiles = await glob('automation/steps/actions/**/*.step.ts', { cwd: baseDir })
  const validationFiles = await glob('automation/steps/validations/**/*.step.ts', { cwd: baseDir })
  return [...actionFiles, ...validationFiles]
}

function extractTestSuiteNameFromFilename(filePath: string): string {
  const fileName = filePath.split(/[/\\]/).pop() ?? ''
  return fileName.replace(/\.feature$/, '')
}

function extractFeatureLevelTags(parsedFeature: ParsedFeature): string[] {
  return parsedFeature.tags.flatMap(splitTagLine)
}

function parseScenarioTitle(scenarioName: string, scenarioDescription?: string): { title: string; description: string } {
  if (scenarioDescription) {
    return {
      title: scenarioDescription.trim(),
      description: scenarioName.trim(),
    }
  }

  return {
    title: scenarioName.trim(),
    description: '',
  }
}

function signatureToRegex(signature: string): RegExp {
  let pattern = signature.replace(/[.*+?^${}()|[\]\\]/g, match => {
    if (match === '{' || match === '}') return match
    return `\\${match}`
  })

  pattern = pattern.replace(/\{string\}/g, '"([^"]+)"')
  pattern = pattern.replace(/\{int\}/g, '(\\d+)')
  pattern = pattern.replace(/\{boolean\}/g, '(true|false)')
  pattern = pattern.replace(/\{number\}/g, '(\\d+(?:\\.\\d+)?)')

  return new RegExp(`^${pattern}$`, 'i')
}

function extractParametersFromGherkinStep(
  gherkinText: string,
  signature: string,
  templateStepParameters: Array<{ name: string; order: number; type: StepParameterType }>,
): ParameterMatch[] | null {
  const match = gherkinText.match(signatureToRegex(signature))
  if (!match) {
    return null
  }

  return match.slice(1).flatMap((value, index) => {
    const parameter = templateStepParameters[index]
    if (!parameter || value == null) {
      return []
    }

    return [
      {
        name: parameter.name,
        value,
        order: parameter.order,
        type: parameter.type,
      },
    ]
  })
}

function matchGherkinStepToTemplateStep(
  gherkinStep: ParsedStep,
  templateSteps: Array<{
    signature: string
    parameters: Array<{ name: string; order: number; type: StepParameterType }>
  }>,
): { signature: string; parameters: ParameterMatch[] } | null {
  for (const templateStep of templateSteps) {
    const parameters = extractParametersFromGherkinStep(gherkinStep.text, templateStep.signature, templateStep.parameters)
    if (parameters) {
      return {
        signature: templateStep.signature,
        parameters,
      }
    }
  }

  return null
}

function determineStepIcon(keyword: string): TemplateStepIcon {
  const lowerKeyword = keyword.toLowerCase().trim()

  if (lowerKeyword === 'given') return TemplateStepIcon.NAVIGATION
  if (lowerKeyword === 'then') return TemplateStepIcon.VALIDATION
  return TemplateStepIcon.MOUSE
}

function sameStringSet(left: string[], right: string[]): boolean {
  const sortedLeft = [...left].sort()
  const sortedRight = [...right].sort()

  return JSON.stringify(sortedLeft) === JSON.stringify(sortedRight)
}

function sameStepParameters(
  left: Array<{ name: string; order: number; type: StepParameterType }>,
  right: Array<{ name: string; order: number; type: StepParameterType }>,
): boolean {
  if (left.length !== right.length) {
    return false
  }

  return left.every((parameter, index) => {
    const other = right[index]
    return (
      parameter.name === other?.name &&
      parameter.order === other?.order &&
      parameter.type === other?.type
    )
  })
}

function sameResolvedParameters(
  left: Array<{ name: string; value: string; order: number; type: StepParameterType }>,
  right: Array<{ name: string; value: string; order: number; type: StepParameterType }>,
): boolean {
  if (left.length !== right.length) {
    return false
  }

  return left.every((parameter, index) => {
    const other = right[index]
    return (
      parameter.name === other?.name &&
      parameter.value === other?.value &&
      parameter.order === other?.order &&
      parameter.type === other?.type
    )
  })
}

async function buildFilesystemSnapshot(baseDir: string): Promise<FilesystemSnapshot> {
  const featuresDir = getAutomationFeaturesDir()
  const [environments, parsedFeatures, locatorFiles, locatorMap, stepFiles] = await Promise.all([
    readEnvironmentsFromFile(),
    scanFeatureFiles(featuresDir),
    scanLocatorFiles(baseDir),
    readLocatorMap(baseDir),
    scanStepFiles(baseDir),
  ])

  const locatorRouteMap = new Map(locatorMap.map(entry => [entry.name, entry.path]))
  const locatorGroups: LocatorGroupFromFs[] = []
  const locatorFileData: LocatorFileData[] = []
  const directModulePaths = new Set<string>()

  for (const filePath of locatorFiles) {
    const modulePath = extractModulePathFromAutomationFile(filePath, baseDir, 'locators')
    const groupName = extractLocatorGroupName(filePath)
    const locators = await readLocatorFile(filePath)

    locatorGroups.push({
      name: groupName,
      route: locatorRouteMap.get(groupName) ?? `/${groupName}`,
      modulePath,
    })
    locatorFileData.push({
      groupName,
      modulePath,
      locators,
    })
    directModulePaths.add(modulePath)
  }

  for (const feature of parsedFeatures) {
    directModulePaths.add(extractModulePathFromFilePath(feature.filePath, featuresDir))
  }

  const tagObjects = buildTagObjects(extractUniqueTags(parsedFeatures))

  const templateStepGroups: StepGroupJSDoc[] = []
  const templateSteps: TemplateStepFromFs[] = []

  for (const file of stepFiles) {
    try {
      const filePath = join(baseDir, file)
      const content = await fs.readFile(filePath, 'utf-8')
      const parsed = parseStepFile(content)
      if (!parsed) {
        continue
      }

      templateStepGroups.push(parsed.group)
      for (const step of parsed.steps) {
        templateSteps.push({
          step,
          groupName: parsed.group.name,
          groupType: parsed.group.type,
        })
      }
    } catch (error) {
      console.error(`Unable to parse step file ${file} for sync counts:`, error)
    }
  }

  const testSuites: TestSuiteFromFs[] = parsedFeatures.map(feature => ({
    name: extractTestSuiteNameFromFilename(feature.filePath),
    description: feature.featureDescription ?? null,
    modulePath: extractModulePathFromFilePath(feature.filePath, featuresDir),
    tags: extractFeatureLevelTags(feature),
  }))

  const testCases: TestCaseFromFs[] = []
  for (const feature of parsedFeatures) {
    const modulePath = extractModulePathFromFilePath(feature.filePath, featuresDir)
    const testSuiteName = extractTestSuiteNameFromFilename(feature.filePath)

    for (const scenario of feature.scenarios) {
      const flattenedTags = scenario.tags.flatMap(splitTagLine)
      const identifierTag = flattenedTags.find(tag => tag.replace(/^@/, '').startsWith('tc_'))
      if (!identifierTag) {
        continue
      }

      const { title, description } = parseScenarioTitle(scenario.name, scenario.description)
      testCases.push({
        identifierTag: normalizeTagExpression(identifierTag),
        title,
        description,
        testSuiteName,
        modulePath,
        filterTags: flattenedTags.filter(tag => normalizeTagExpression(tag) !== normalizeTagExpression(identifierTag)),
        steps: scenario.steps,
      })
    }
  }

  return {
    environments,
    modulePaths: buildModuleTreePaths(directModulePaths),
    locatorGroups,
    locatorFiles: locatorFileData,
    tagObjects,
    templateStepGroups,
    templateSteps,
    testSuites,
    testCases,
  }
}

function countModuleMismatches(
  filesystemPaths: Set<string>,
  dbModules: Array<{ id: string; name: string; path: string; parentId: string | null }>,
): number {
  const dbPaths = new Set<string>()
  let rootExists = false

  for (const module of dbModules) {
    if (module.name === 'root' && module.parentId === null) {
      rootExists = true
      continue
    }

    dbPaths.add(module.path)
  }

  let count = 0
  for (const modulePath of filesystemPaths) {
    if (modulePath === '/') {
      if (!rootExists) count++
      continue
    }

    if (!dbPaths.has(modulePath)) {
      count++
    }
  }

  for (const modulePath of dbPaths) {
    if (!filesystemPaths.has(modulePath)) {
      count++
    }
  }

  return count
}

function countEnvironmentMismatches(
  filesystemEnvironments: EnvironmentData[],
  dbEnvironments: Array<{ name: string }>,
): number {
  const fsByNormalizedName = new Map(filesystemEnvironments.map(environment => [normalizeEnvironmentName(environment.name), environment]))
  const dbByNormalizedName = new Map<string, { name: string }>()

  for (const environment of dbEnvironments) {
    const normalizedName = normalizeEnvironmentName(environment.name)
    if (!dbByNormalizedName.has(normalizedName)) {
      dbByNormalizedName.set(normalizedName, environment)
    }
  }

  let count = 0
  for (const environment of filesystemEnvironments) {
    const existing = dbByNormalizedName.get(normalizeEnvironmentName(environment.name))
    if (!existing || existing.name !== environment.name) {
      count++
    }
  }

  for (const environment of dbEnvironments) {
    if (!fsByNormalizedName.has(normalizeEnvironmentName(environment.name))) {
      count++
    }
  }

  return count
}

function countTagMismatches(
  filesystemTags: Array<{ name: string; tagExpression: string; type: TagType }>,
  dbTags: Array<{ name: string; type: TagType }>,
): number {
  const fsByName = new Map(filesystemTags.map(tag => [tag.name, tag]))
  const dbByName = new Map<string, { name: string; type: TagType }>()

  for (const tag of dbTags) {
    if (!dbByName.has(tag.name)) {
      dbByName.set(tag.name, tag)
    }
  }

  let count = 0
  for (const tag of filesystemTags) {
    const existing = dbByName.get(tag.name)
    if (!existing || existing.type !== tag.type) {
      count++
    }
  }

  for (const tag of dbTags) {
    if (!fsByName.has(tag.name)) {
      count++
    }
  }

  return count
}

function countTemplateStepGroupMismatches(
  filesystemGroups: StepGroupJSDoc[],
  dbGroups: Array<{ name: string; description: string | null; type: TemplateStepGroupType }>,
): number {
  const fsByName = new Map(filesystemGroups.map(group => [group.name, group]))
  const dbByName = new Map(dbGroups.map(group => [group.name, group]))
  let count = 0

  for (const group of filesystemGroups) {
    const existing = dbByName.get(group.name)
    if (!existing) {
      count++
      continue
    }

    if ((existing.description ?? null) !== (group.description ?? null) || existing.type !== group.type) {
      count++
    }
  }

  for (const group of dbGroups) {
    if (!fsByName.has(group.name)) {
      count++
    }
  }

  return count
}

function countTemplateStepMismatches(
  filesystemSteps: TemplateStepFromFs[],
  dbSteps: Array<{
    signature: string
    name: string
    description: string | null
    functionDefinition: string | null
    icon: TemplateStepIcon
    type: TemplateStepType
    templateStepGroup: { name: string }
    parameters: Array<{ name: string; order: number; type: StepParameterType }>
  }>,
): number {
  const fsSignatures = new Set(filesystemSteps.map(item => item.step.signature))
  const dbBySignature = new Map(dbSteps.map(step => [step.signature, step]))
  let count = 0

  for (const item of filesystemSteps) {
    const existing = dbBySignature.get(item.step.signature)
    const expectedType =
      item.groupType === TemplateStepGroupType.ACTION ? TemplateStepType.ACTION : TemplateStepType.ASSERTION

    if (!existing) {
      count++
      continue
    }

    const needsUpdate =
      existing.name !== item.step.jsdoc.name ||
      (existing.description ?? '') !== (item.step.jsdoc.description ?? '') ||
      (existing.functionDefinition ?? '') !== item.step.functionDefinition ||
      existing.icon !== item.step.jsdoc.icon ||
      existing.type !== expectedType ||
      existing.templateStepGroup.name !== item.groupName ||
      !sameStepParameters(existing.parameters, item.step.parameters)

    if (needsUpdate) {
      count++
    }
  }

  for (const step of dbSteps) {
    if (!fsSignatures.has(step.signature)) {
      count++
    }
  }

  return count
}

function countLocatorGroupMismatches(
  filesystemGroups: LocatorGroupFromFs[],
  dbGroups: Array<{ name: string; route: string; moduleId: string }>,
  modulePathMap: Map<string, string>,
): number {
  const fsByName = new Map(filesystemGroups.map(group => [group.name, group]))
  const dbByName = new Map(dbGroups.map(group => [group.name, group]))
  let count = 0

  for (const group of filesystemGroups) {
    const existing = dbByName.get(group.name)
    if (!existing) {
      count++
      continue
    }

    const existingModulePath = modulePathMap.get(existing.moduleId) ?? '/'
    if (existing.route !== group.route || existingModulePath !== group.modulePath) {
      count++
    }
  }

  for (const group of dbGroups) {
    if (!fsByName.has(group.name)) {
      count++
    }
  }

  return count
}

function countLocatorMismatches(
  filesystemLocatorFiles: LocatorFileData[],
  dbGroups: Array<{
    name: string
    locators: Array<{ name: string; value: string }>
  }>,
): number {
  const dbGroupsByName = new Map(dbGroups.map(group => [group.name, group]))
  let count = 0

  for (const file of filesystemLocatorFiles) {
    const dbGroup = dbGroupsByName.get(file.groupName)
    const fileLocators = Object.entries(file.locators)

    if (!dbGroup) {
      count += fileLocators.length
      continue
    }

    const dbLocators = new Map(dbGroup.locators.map(locator => [locator.name, locator.value]))
    const fileLocatorNames = new Set<string>()

    for (const [name, value] of fileLocators) {
      fileLocatorNames.add(name)
      if (!dbLocators.has(name) || dbLocators.get(name) !== value) {
        count++
      }
    }

    for (const locator of dbGroup.locators) {
      if (!fileLocatorNames.has(locator.name)) {
        count++
      }
    }
  }

  return count
}

function countTestSuiteMismatches(
  filesystemSuites: TestSuiteFromFs[],
  dbSuites: Array<{
    name: string
    description: string | null
    moduleId: string
    tags: Array<{ tagExpression: string }>
  }>,
  modulePathMap: Map<string, string>,
): number {
  const fsKeys = new Set(filesystemSuites.map(suite => `${suite.name}::${suite.modulePath}`))
  const dbByKey = new Map(
    dbSuites.map(suite => [`${suite.name}::${modulePathMap.get(suite.moduleId) ?? '/'}`, suite] as const),
  )
  let count = 0

  for (const suite of filesystemSuites) {
    const key = `${suite.name}::${suite.modulePath}`
    const existing = dbByKey.get(key as `${string}::${string}`)
    if (!existing) {
      count++
      continue
    }

    const dbTagExpressions = existing.tags.map(tag => normalizeTagExpression(tag.tagExpression))
    const fsTagExpressions = suite.tags.map(normalizeTagExpression)
    const needsUpdate =
      (existing.description ?? null) !== (suite.description ?? null) || !sameStringSet(dbTagExpressions, fsTagExpressions)

    if (needsUpdate) {
      count++
    }
  }

  for (const suite of dbSuites) {
    const key = `${suite.name}::${modulePathMap.get(suite.moduleId) ?? '/'}`
    if (!fsKeys.has(key)) {
      count++
    }
  }

  return count
}

function hasTestCaseStepMismatch(
  stepsFromFs: ParsedStep[],
  dbSteps: Array<{
    order: number
    gherkinStep: string
    label: string
    icon: TemplateStepIcon
    TemplateStep: { signature: string } | null
    parameters: Array<{ name: string; value: string; order: number; type: StepParameterType }>
  }>,
  dbTemplateSteps: Array<{
    signature: string
    parameters: Array<{ name: string; order: number; type: StepParameterType }>
  }>,
): boolean {
  const dbStepsByOrder = new Map(dbSteps.map(step => [step.order, step]))

  for (const step of stepsFromFs) {
    const existing = dbStepsByOrder.get(step.order)
    const matchedTemplateStep = matchGherkinStepToTemplateStep(step, dbTemplateSteps)

    if (!existing || !matchedTemplateStep) {
      return true
    }

    const expectedIcon = determineStepIcon(step.keyword)
    const expectedGherkinStep = `${step.keyword} ${step.text}`

    if (
      existing.gherkinStep !== expectedGherkinStep ||
      existing.label !== step.text ||
      existing.icon !== expectedIcon ||
      existing.TemplateStep?.signature !== matchedTemplateStep.signature ||
      !sameResolvedParameters(existing.parameters, matchedTemplateStep.parameters)
    ) {
      return true
    }
  }

  const fsOrders = new Set(stepsFromFs.map(step => step.order))
  return dbSteps.some(step => !fsOrders.has(step.order))
}

function countTestCaseMismatches(
  filesystemTestCases: TestCaseFromFs[],
  dbTestCases: Array<{
    title: string
    description: string
    tags: Array<{ tagExpression: string; type: TagType }>
    TestSuite: Array<{ name: string; moduleId: string }>
    steps: Array<{
      order: number
      gherkinStep: string
      label: string
      icon: TemplateStepIcon
      TemplateStep: { signature: string } | null
      parameters: Array<{ name: string; value: string; order: number; type: StepParameterType }>
    }>
  }>,
  modulePathMap: Map<string, string>,
  dbTemplateSteps: Array<{
    signature: string
    parameters: Array<{ name: string; order: number; type: StepParameterType }>
  }>,
): number {
  const dbByIdentifier = new Map<string, (typeof dbTestCases)[number]>()
  let count = 0

  for (const testCase of dbTestCases) {
    const identifierTag = testCase.tags.find(tag => tag.type === TagType.IDENTIFIER)
    if (!identifierTag) {
      count++
      continue
    }

    const normalizedIdentifier = normalizeTagExpression(identifierTag.tagExpression)
    if (!dbByIdentifier.has(normalizedIdentifier)) {
      dbByIdentifier.set(normalizedIdentifier, testCase)
    }
  }

  const fsIdentifiers = new Set(filesystemTestCases.map(testCase => testCase.identifierTag))

  for (const testCase of filesystemTestCases) {
    const existing = dbByIdentifier.get(testCase.identifierTag)
    if (!existing) {
      count++
      continue
    }

    const existingFilterTags = existing.tags
      .filter(tag => tag.type === TagType.FILTER)
      .map(tag => normalizeTagExpression(tag.tagExpression))
    const needsUpdate =
      existing.title !== testCase.title ||
      existing.description !== testCase.description ||
      !sameStringSet(existingFilterTags, testCase.filterTags.map(normalizeTagExpression)) ||
      hasTestCaseStepMismatch(testCase.steps, existing.steps, dbTemplateSteps)

    if (needsUpdate) {
      count++
    }
  }

  for (const testCase of dbTestCases) {
    const identifierTag = testCase.tags.find(tag => tag.type === TagType.IDENTIFIER)
    if (!identifierTag) {
      continue
    }

    if (!fsIdentifiers.has(normalizeTagExpression(identifierTag.tagExpression))) {
      count++
    }
  }

  return count
}

function emptyCounts(): SyncPendingCounts {
  const counts = Object.fromEntries(syncScriptDefinitions.map(definition => [definition.id, 0])) as Record<SyncScriptId, number>
  return {
    ...counts,
    [SYNC_ALL_REQUEST_ID]: 0,
  }
}

export async function getSyncPendingCounts(): Promise<SyncPendingCounts> {
  try {
    await ensureAutomationWorkspaceReady()

    const baseDir = process.cwd()
    const filesystem = await buildFilesystemSnapshot(baseDir)
    const [
      dbModules,
      dbEnvironments,
      dbTags,
      dbTemplateStepGroups,
      dbTemplateSteps,
      dbLocatorGroups,
      dbTestSuites,
      dbTestCases,
    ] = await Promise.all([
      getAllModulesWithPaths(),
      prisma.environment.findMany({ select: { name: true } }),
      prisma.tag.findMany({ select: { name: true, type: true } }),
      prisma.templateStepGroup.findMany({ select: { name: true, description: true, type: true } }),
      prisma.templateStep.findMany({
        select: {
          signature: true,
          name: true,
          description: true,
          functionDefinition: true,
          icon: true,
          type: true,
          parameters: {
            select: { name: true, order: true, type: true },
            orderBy: { order: 'asc' },
          },
          templateStepGroup: {
            select: { name: true },
          },
        },
      }),
      prisma.locatorGroup.findMany({
        select: {
          name: true,
          route: true,
          moduleId: true,
          locators: {
            select: { name: true, value: true },
          },
        },
      }),
      prisma.testSuite.findMany({
        select: {
          name: true,
          description: true,
          moduleId: true,
          tags: {
            select: { tagExpression: true },
          },
        },
      }),
      prisma.testCase.findMany({
        select: {
          title: true,
          description: true,
          tags: {
            select: { tagExpression: true, type: true },
          },
          TestSuite: {
            select: { name: true, moduleId: true },
          },
          steps: {
            orderBy: { order: 'asc' },
            select: {
              order: true,
              gherkinStep: true,
              label: true,
              icon: true,
              TemplateStep: {
                select: { signature: true },
              },
              parameters: {
                select: { name: true, value: true, order: true, type: true },
                orderBy: { order: 'asc' },
              },
            },
          },
        },
      }),
    ])

    const modulePathMap = new Map(dbModules.map(module => [module.id, module.name === 'root' && module.parentId === null ? '/' : module.path]))

    const counts: Record<SyncScriptId, number> = {
      'sync-modules': countModuleMismatches(filesystem.modulePaths, dbModules),
      'sync-environments': countEnvironmentMismatches(filesystem.environments, dbEnvironments),
      'sync-tags': countTagMismatches(filesystem.tagObjects, dbTags),
      'sync-template-step-groups': countTemplateStepGroupMismatches(filesystem.templateStepGroups, dbTemplateStepGroups),
      'sync-template-steps': countTemplateStepMismatches(filesystem.templateSteps, dbTemplateSteps),
      'sync-locator-groups': countLocatorGroupMismatches(filesystem.locatorGroups, dbLocatorGroups, modulePathMap),
      'sync-locators': countLocatorMismatches(filesystem.locatorFiles, dbLocatorGroups),
      'sync-test-suites': countTestSuiteMismatches(filesystem.testSuites, dbTestSuites, modulePathMap),
      'sync-test-cases': countTestCaseMismatches(
        filesystem.testCases,
        dbTestCases,
        modulePathMap,
        dbTemplateSteps.map(step => ({
          signature: step.signature,
          parameters: step.parameters,
        })),
      ),
    }

    return {
      ...counts,
      [SYNC_ALL_REQUEST_ID]: Object.values(counts).reduce((sum, count) => sum + count, 0),
    }
  } catch (error) {
    console.error('Unable to compute sync pending counts:', error)
    return emptyCounts()
  }
}
