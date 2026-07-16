import { promises as fs } from 'fs'
import { join } from 'path'
import { glob } from 'glob'
import { parse } from '@babel/parser'
import * as t from '@babel/types'
import _traverse from '@babel/traverse'
import type { NodePath } from '@babel/traverse'
import { StepParameterType, TagType, TemplateStepGroupType, TemplateStepIcon, TemplateStepType } from '@prisma/client'
import prisma from '@/config/db-config'
import { getAutomationEnvironmentsDir, getAutomationFeaturesDir } from '@/lib/automation/automation-path-roots'
import { ensureAutomationWorkspaceReady } from '@/lib/automation/automation-workspace'
import {
  extractModulePathFromFilePath,
  scanFeatureFiles,
  type ParsedFeature,
  type ParsedStep,
} from '@/lib/gherkin-parser'
import { getAllModulesWithPaths } from '@/lib/module-hierarchy-builder'
import {
  SYNC_ALL_REQUEST_ID,
  syncScriptDefinitions,
  type SyncRequestId,
  type SyncScriptId,
} from '@/lib/sync/sync-registry'
import { getTagTypeFromName } from '@/lib/tag-identifiers'
import { normalizeFunctionDefinition } from '@/lib/sync/normalize-function-definition'
import { extractModulePathFromAutomationFile, getAutomationLocatorMapPath } from '@/lib/template-sync-utils'
import {
  determineProjectedStepIcon,
  generateProjectedGherkinSteps,
  getTestSuiteSyncIdentity,
  normalizeProjectedDbTestCaseSteps,
} from '@/lib/sync/projected-feature-utils'
import type { AppraiseTestCaseMetadataFlowBlock, AppraiseTestCaseMetadataNode } from '@/lib/appraise-test-case-metadata'
import { countPendingPlanSync } from '@/lib/plans/plan-sync-service'
import {
  parseGroupJSDocLenient as parseGroupJSDoc,
  parseStepJSDocLenient as parseStepJSDoc,
  type StepGroupJSDoc,
  type StepJSDoc,
} from '@/lib/jsdoc/template-step-jsdoc'

const traverse = (_traverse as { default?: typeof _traverse }).default ?? _traverse

export type SyncPendingCounts = Record<SyncRequestId, number>

type EnvironmentConfig = {
  baseUrl: string
  apiBaseUrl: string
  email: string
  passwordEnvironmentVariable: string
}

type EnvironmentData = {
  name: string
  baseUrl: string
  apiBaseUrl: string | null
  username: string | null
  passwordEnvironmentVariable: string | null
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

type StepParameter = {
  name: string
  type: StepParameterType
  order: number
}

type ParsedTemplateStep = {
  jsdoc: StepJSDoc
  signature: string
  functionDefinition: string
  normalizedFunctionDefinition: string
  parameters: StepParameter[]
  keyword: 'When' | 'Then' | 'Given'
}

type ParsedStepFile = {
  group: StepGroupJSDoc
  steps: ParsedTemplateStep[]
}

type StepKeyword = ParsedTemplateStep['keyword']

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
  hasAppraiseMetadata?: boolean
  nodes: AppraiseTestCaseMetadataNode[]
  flowBlocks: AppraiseTestCaseMetadataFlowBlock[]
}

type CollapsedTestCaseFromFs = TestCaseFromFs & {
  expectedSuiteIdentities: Set<string>
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

  return name
    .trim()
    .replace(/[_\s]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(segment => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join(' ')
}

function getEnvironmentIdentityKey(name: string): string {
  return name
    .trim()
    .replace(/[_\s]+/g, ' ')
    .toLowerCase()
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
      passwordEnvironmentVariable: config.passwordEnvironmentVariable?.trim() || null,
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

function getStepKeyword(node: t.CallExpression): StepKeyword | null {
  const callee = node.callee
  return t.isIdentifier(callee) && (callee.name === 'When' || callee.name === 'Then' || callee.name === 'Given')
    ? callee.name
    : null
}

function getStepSignature(node: t.CallExpression): string | null {
  const patternArg = node.arguments[0]
  return t.isStringLiteral(patternArg) ? patternArg.value : null
}

function getStepFunction(node: t.CallExpression): t.Function | null {
  const functionArg = node.arguments[1]
  return t.isFunction(functionArg) ? functionArg : null
}

function getIdentifierParameterType(parameter: t.Identifier): string | null {
  if (!parameter.typeAnnotation || !t.isTSTypeAnnotation(parameter.typeAnnotation)) {
    return null
  }

  const annotation = parameter.typeAnnotation.typeAnnotation
  if (t.isTSTypeReference(annotation) && t.isIdentifier(annotation.typeName)) {
    return annotation.typeName.name
  }

  if (t.isTSStringKeyword(annotation)) return 'string'
  if (t.isTSNumberKeyword(annotation)) return 'number'
  if (t.isTSBooleanKeyword(annotation)) return 'boolean'
  return null
}

function parseStepParameters(parameters: t.Function['params']): StepParameter[] | null {
  const parsedParameters: StepParameter[] = []

  for (const parameter of parameters) {
    if ((t.isIdentifier(parameter) && parameter.name === 'this') || t.isObjectPattern(parameter)) {
      continue
    }

    if (!t.isIdentifier(parameter)) {
      continue
    }

    const typeName = getIdentifierParameterType(parameter)
    if (!typeName) {
      continue
    }

    try {
      parsedParameters.push({
        name: parameter.name,
        type: mapTypeToParameterType(typeName),
        order: parsedParameters.length,
      })
    } catch {
      return null
    }
  }

  return parsedParameters
}

function parseStepCall(node: t.CallExpression, content: string): ParsedTemplateStep | null {
  const keyword = getStepKeyword(node)
  if (!keyword || node.arguments.length < 2) return null

  const signature = getStepSignature(node)
  const functionArg = getStepFunction(node)
  const lineNumber = node.loc?.start?.line
  if (!signature || !functionArg || lineNumber == null) return null

  const jsdoc = parseStepJSDoc(content, lineNumber - 1)
  const parameters = parseStepParameters(functionArg.params)
  if (!jsdoc || !parameters) return null

  return {
    jsdoc,
    signature,
    functionDefinition: extractFunctionDefinition(node, content),
    normalizedFunctionDefinition: '',
    parameters,
    keyword,
  }
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
      const step = parseStepCall(path.node, content)
      if (step) steps.push(step)
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

function parseScenarioTitle(
  scenarioName: string,
  scenarioDescription?: string,
): { title: string; description: string } {
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
    const parameters = extractParametersFromGherkinStep(
      gherkinStep.text,
      templateStep.signature,
      templateStep.parameters,
    )
    if (parameters) {
      return {
        signature: templateStep.signature,
        parameters,
      }
    }
  }

  return null
}

function groupRecordsByKey<T>(records: T[], getKey: (record: T) => string | null | undefined): Map<string, T[]> {
  const recordsByKey = new Map<string, T[]>()

  for (const record of records) {
    const key = getKey(record)
    if (!key) {
      continue
    }

    const existing = recordsByKey.get(key)
    if (existing) {
      existing.push(record)
      continue
    }

    recordsByKey.set(key, [record])
  }

  return recordsByKey
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
    return parameter.name === other?.name && parameter.order === other?.order && parameter.type === other?.type
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

      await Promise.all(
        parsed.steps.map(async step => {
          step.normalizedFunctionDefinition = await normalizeFunctionDefinition(step.functionDefinition)
        }),
      )

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
    description: feature.featureDescription ?? feature.featureName ?? null,
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

      const parsedTitle = parseScenarioTitle(scenario.name, scenario.description)
      testCases.push({
        identifierTag: normalizeTagExpression(identifierTag),
        title: scenario.appraiseMetadata?.title ?? parsedTitle.title,
        description: scenario.appraiseMetadata?.description ?? parsedTitle.description,
        testSuiteName,
        modulePath,
        filterTags: flattenedTags.filter(tag => normalizeTagExpression(tag) !== normalizeTagExpression(identifierTag)),
        steps: scenario.steps,
        hasAppraiseMetadata: scenario.appraiseMetadata != null,
        nodes: scenario.appraiseMetadata?.nodes ?? [],
        flowBlocks: scenario.appraiseMetadata?.flowBlocks ?? [],
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

export function countModuleMismatches(
  filesystemPaths: Set<string>,
  dbModules: Array<{ id: string; name: string; path: string; parentId: string | null }>,
): number {
  const dbPaths = new Set<string>()
  let rootExists = false

  for (const dbModule of dbModules) {
    if (dbModule.name === 'root' && dbModule.parentId === null) {
      rootExists = true
      continue
    }

    dbPaths.add(dbModule.path)
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

  return count
}

export function countEnvironmentMismatches(
  filesystemEnvironments: EnvironmentData[],
  dbEnvironments: Array<{
    name: string
    baseUrl: string
    apiBaseUrl: string | null
    username: string | null
    passwordEnvironmentVariable: string | null
    _count?: { testRuns: number }
  }>,
): number {
  const fsByNormalizedName = new Map(
    filesystemEnvironments.map(environment => [getEnvironmentIdentityKey(environment.name), environment]),
  )
  const dbByNormalizedName = new Map<string, (typeof dbEnvironments)[number]>()

  for (const environment of dbEnvironments) {
    const normalizedName = getEnvironmentIdentityKey(environment.name)
    if (!dbByNormalizedName.has(normalizedName)) {
      dbByNormalizedName.set(normalizedName, environment)
    }
  }

  let count = 0
  for (const environment of filesystemEnvironments) {
    const existing = dbByNormalizedName.get(getEnvironmentIdentityKey(environment.name))
    if (!existing) {
      count++
      continue
    }

    if (
      existing.baseUrl !== environment.baseUrl ||
      (existing.apiBaseUrl ?? null) !== environment.apiBaseUrl ||
      (existing.username ?? null) !== environment.username ||
      (existing.passwordEnvironmentVariable ?? null) !== environment.passwordEnvironmentVariable
    ) {
      count++
    }
  }

  for (const environment of dbEnvironments) {
    const canDelete = (environment._count?.testRuns ?? 0) === 0
    if (canDelete && !fsByNormalizedName.has(getEnvironmentIdentityKey(environment.name))) {
      count++
    }
  }

  return count
}

export function countTagMismatches(
  filesystemTags: Array<{ name: string; tagExpression: string; type: TagType }>,
  dbTags: Array<{ name: string; type: TagType }>,
): number {
  const dbByName = groupRecordsByKey(dbTags, tag => tag.name)

  let count = 0
  for (const tag of filesystemTags) {
    const hasMatch = (dbByName.get(tag.name) ?? []).some(existing => existing.type === tag.type)
    if (!hasMatch) {
      count++
    }
  }

  return count
}

export function countTemplateStepGroupMismatches(
  filesystemGroups: StepGroupJSDoc[],
  dbGroups: Array<{ name: string; description: string | null; type: TemplateStepGroupType }>,
): number {
  const dbByName = groupRecordsByKey(dbGroups, group => group.name)
  let count = 0

  for (const group of filesystemGroups) {
    const hasMatch = (dbByName.get(group.name) ?? []).some(existing => {
      return (existing.description ?? null) === (group.description ?? null) && existing.type === group.type
    })

    if (!hasMatch) {
      count++
    }
  }

  return count
}

export function countTemplateStepMismatches(
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
  const filesystemStepsBySignature = new Map<string, TemplateStepFromFs>()
  const dbBySignature = groupRecordsByKey(dbSteps, step => step.signature)
  let count = 0

  for (const item of filesystemSteps) {
    filesystemStepsBySignature.set(item.step.signature, item)
  }

  for (const item of filesystemStepsBySignature.values()) {
    const expectedType =
      item.groupType === TemplateStepGroupType.ACTION ? TemplateStepType.ACTION : TemplateStepType.ASSERTION

    const hasMatch = (dbBySignature.get(item.step.signature) ?? []).some(existing => {
      return (
        existing.name === item.step.jsdoc.name &&
        (existing.description ?? '') === (item.step.jsdoc.description ?? '') &&
        (existing.functionDefinition ?? '') === item.step.normalizedFunctionDefinition &&
        existing.icon === item.step.jsdoc.icon &&
        existing.type === expectedType &&
        existing.templateStepGroup.name === item.groupName &&
        sameStepParameters(existing.parameters, item.step.parameters)
      )
    })

    if (!hasMatch) {
      count++
    }
  }

  return count
}

export function countLocatorGroupMismatches(
  filesystemGroups: LocatorGroupFromFs[],
  dbGroups: Array<{ name: string; route: string; moduleId: string }>,
  modulePathMap: Map<string, string>,
): number {
  const fsByName = new Map<string, LocatorGroupFromFs>()
  const dbByName = new Map(dbGroups.map(group => [group.name, group]))
  let count = 0

  for (const group of filesystemGroups) {
    fsByName.set(group.name, group)
  }

  for (const group of fsByName.values()) {
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

export function countTestSuiteMismatches(
  filesystemSuites: TestSuiteFromFs[],
  dbSuites: Array<{
    name: string
    description: string | null
    moduleId: string
    tags: Array<{ tagExpression: string }>
  }>,
  modulePathMap: Map<string, string>,
): number {
  const dbByKey = groupRecordsByKey(dbSuites, suite =>
    getTestSuiteSyncIdentity(suite.name, modulePathMap.get(suite.moduleId) ?? '/'),
  )
  const filesystemSuitesByKey = new Map<string, TestSuiteFromFs>()
  let count = 0

  for (const suite of filesystemSuites) {
    const suiteKey = getTestSuiteSyncIdentity(suite.name, suite.modulePath)
    filesystemSuitesByKey.set(suiteKey, suite)
  }

  for (const [suiteKey, suite] of filesystemSuitesByKey) {
    const fsTagExpressions = suite.tags.map(normalizeTagExpression)
    const hasMatch = (dbByKey.get(suiteKey) ?? []).some(existing => {
      const dbTagExpressions = existing.tags.map(tag => normalizeTagExpression(tag.tagExpression))
      const expectedDescription = existing.description ?? existing.name
      return expectedDescription === (suite.description ?? null) && sameStringSet(dbTagExpressions, fsTagExpressions)
    })

    if (!hasMatch) {
      count++
    }
  }

  return count
}

type ProjectedTestCaseStep = {
  order: number
  gherkinStep: string
  label: string
  icon: TemplateStepIcon
}

function normalizeProjectedFsTestCaseSteps(stepsFromFs: ParsedStep[]): ProjectedTestCaseStep[] {
  const storedSteps = stepsFromFs.map(step => ({
    order: step.order,
    gherkinStep: `${step.keyword} ${step.text}`,
  }))
  const projectedGherkinSteps = generateProjectedGherkinSteps(storedSteps)

  return stepsFromFs.map((step, index) => {
    const gherkinStep = projectedGherkinSteps[index] ?? ''
    const [keyword = '', ...textParts] = gherkinStep.split(' ')
    const label = textParts.join(' ')

    return {
      order: step.order,
      gherkinStep,
      label,
      icon: determineProjectedStepIcon(keyword),
    }
  })
}

function hasProjectedTestCaseStepMismatch(
  stepsFromFs: ParsedStep[],
  nodesFromFs: AppraiseTestCaseMetadataNode[] = [],
  dbSteps: Array<{
    order: number
    gherkinStep: string
    flowNodeId: string | null
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
  const projectedDbSteps = normalizeProjectedDbTestCaseSteps(dbSteps)
  const projectedFsSteps = normalizeProjectedFsTestCaseSteps(stepsFromFs)
  const dbStepsByOrder = new Map(projectedDbSteps.map(step => [step.order, step]))
  const fsStepsByOrder = new Map(stepsFromFs.map(step => [step.order, step]))
  const nodesByOrder = new Map(nodesFromFs.map(node => [node.order, node]))

  for (const projectedFsStep of projectedFsSteps) {
    const existing = dbStepsByOrder.get(projectedFsStep.order)
    const sourceStep = fsStepsByOrder.get(projectedFsStep.order)
    const metadataNode = nodesByOrder.get(projectedFsStep.order)
    const matchedTemplateStep = sourceStep ? matchGherkinStepToTemplateStep(sourceStep, dbTemplateSteps) : null

    if (!existing || !matchedTemplateStep) {
      return true
    }

    if (
      existing.gherkinStep !== projectedFsStep.gherkinStep ||
      existing.flowNodeId !== (metadataNode?.nodeId ?? existing.flowNodeId) ||
      existing.label !== (metadataNode?.label ?? projectedFsStep.label) ||
      existing.icon !== projectedFsStep.icon ||
      existing.templateStepSignature !== matchedTemplateStep.signature ||
      !sameResolvedParameters(existing.parameters, matchedTemplateStep.parameters)
    ) {
      return true
    }
  }

  const fsOrders = new Set(stepsFromFs.map(step => step.order))
  return projectedDbSteps.some(step => !fsOrders.has(step.order))
}

function hasFlowBlockMismatch(
  flowBlocksFromFs: AppraiseTestCaseMetadataFlowBlock[] = [],
  hasAppraiseMetadata: boolean | undefined,
  dbFlowBlocks: Array<{
    id: string
    name: string
    order: number
    nodes: Array<{ flowNodeId: string }>
  }>,
): boolean {
  if (!hasAppraiseMetadata) {
    return false
  }

  if (flowBlocksFromFs.length !== dbFlowBlocks.length) {
    return true
  }

  const dbById = new Map(dbFlowBlocks.map(block => [block.id, block]))

  return flowBlocksFromFs.some(block => {
    const existing = dbById.get(block.id)
    if (!existing || existing.name !== block.name || existing.order !== block.order) {
      return true
    }

    return !sameStringSet(
      existing.nodes.map(node => node.flowNodeId),
      block.nodeIds,
    )
  })
}

export function countTestCaseMismatches(
  filesystemTestCases: TestCaseFromFs[],
  dbTestCases: Array<{
    title: string
    description: string
    tags: Array<{ tagExpression: string; type: TagType }>
    TestSuite: Array<{ name: string; moduleId: string }>
    steps: Array<{
      order: number
      gherkinStep: string
      flowNodeId: string | null
      label: string
      icon: TemplateStepIcon
      TemplateStep: { signature: string } | null
      parameters: Array<{ name: string; value: string; order: number; type: StepParameterType }>
    }>
    flowBlocks: Array<{
      id: string
      name: string
      order: number
      nodes: Array<{ flowNodeId: string }>
    }>
  }>,
  modulePathMap: Map<string, string>,
  dbTemplateSteps: Array<{
    signature: string
    parameters: Array<{ name: string; order: number; type: StepParameterType }>
  }>,
): number {
  const filesystemTestCasesByIdentifier = new Map<string, CollapsedTestCaseFromFs>()
  const dbByIdentifier = new Map<string, Array<(typeof dbTestCases)[number]>>()
  let count = 0

  for (const testCase of filesystemTestCases) {
    const expectedSuiteIdentity = getTestSuiteSyncIdentity(testCase.testSuiteName, testCase.modulePath)
    const existing = filesystemTestCasesByIdentifier.get(testCase.identifierTag)

    if (existing) {
      existing.expectedSuiteIdentities.add(expectedSuiteIdentity)
      filesystemTestCasesByIdentifier.set(testCase.identifierTag, {
        ...testCase,
        expectedSuiteIdentities: existing.expectedSuiteIdentities,
      })
      continue
    }

    filesystemTestCasesByIdentifier.set(testCase.identifierTag, {
      ...testCase,
      expectedSuiteIdentities: new Set([expectedSuiteIdentity]),
    })
  }

  for (const testCase of dbTestCases) {
    const identifierTag = testCase.tags.find(tag => tag.type === TagType.IDENTIFIER)
    if (!identifierTag) {
      continue
    }

    const normalizedIdentifier = normalizeTagExpression(identifierTag.tagExpression)
    const existing = dbByIdentifier.get(normalizedIdentifier)
    if (existing) {
      existing.push(testCase)
      continue
    }

    dbByIdentifier.set(normalizedIdentifier, [testCase])
  }

  for (const testCase of filesystemTestCasesByIdentifier.values()) {
    const normalizedFilterTags = testCase.filterTags.map(normalizeTagExpression)
    const hasMatch = (dbByIdentifier.get(testCase.identifierTag) ?? []).some(existing => {
      const existingFilterTags = existing.tags
        .filter(tag => tag.type === TagType.FILTER)
        .map(tag => normalizeTagExpression(tag.tagExpression))
      const existingSuiteIdentities = new Set(
        existing.TestSuite.map(suite => getTestSuiteSyncIdentity(suite.name, modulePathMap.get(suite.moduleId) ?? '/')),
      )
      const isLinkedToExpectedSuites = Array.from(testCase.expectedSuiteIdentities).every(identity =>
        existingSuiteIdentities.has(identity),
      )

      return (
        existing.title === testCase.title &&
        existing.description === testCase.description &&
        isLinkedToExpectedSuites &&
        sameStringSet(existingFilterTags, normalizedFilterTags) &&
        !hasProjectedTestCaseStepMismatch(testCase.steps, testCase.nodes, existing.steps, dbTemplateSteps) &&
        !hasFlowBlockMismatch(testCase.flowBlocks, testCase.hasAppraiseMetadata, existing.flowBlocks ?? [])
      )
    })

    if (!hasMatch) {
      count++
    }
  }

  return count
}

function emptyCounts(): SyncPendingCounts {
  const counts = Object.fromEntries(syncScriptDefinitions.map(definition => [definition.id, 0])) as Record<
    SyncScriptId,
    number
  >
  return {
    ...counts,
    [SYNC_ALL_REQUEST_ID]: 0,
  }
}

export async function getSyncPendingCounts(): Promise<SyncPendingCounts> {
  try {
    await ensureAutomationWorkspaceReady()
    const pendingPlans = await countPendingPlanSync()

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
      prisma.environment.findMany({
        select: {
          name: true,
          baseUrl: true,
          apiBaseUrl: true,
          username: true,
          passwordEnvironmentVariable: true,
          _count: {
            select: { testRuns: true },
          },
        },
      }),
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
              flowNodeId: true,
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
          flowBlocks: {
            select: {
              id: true,
              name: true,
              order: true,
              nodes: {
                select: {
                  flowNodeId: true,
                },
              },
            },
          },
        },
      }),
    ])

    const normalizedDbTemplateSteps = await Promise.all(
      dbTemplateSteps.map(async step => ({
        ...step,
        functionDefinition: await normalizeFunctionDefinition(step.functionDefinition),
      })),
    )

    const modulePathMap = new Map(
      dbModules.map(module => [module.id, module.name === 'root' && module.parentId === null ? '/' : module.path]),
    )

    const counts: Record<SyncScriptId, number> = {
      'sync-plans': pendingPlans,
      'sync-modules': countModuleMismatches(filesystem.modulePaths, dbModules),
      'sync-environments': countEnvironmentMismatches(filesystem.environments, dbEnvironments),
      'sync-tags': countTagMismatches(filesystem.tagObjects, dbTags),
      'sync-template-step-groups': countTemplateStepGroupMismatches(
        filesystem.templateStepGroups,
        dbTemplateStepGroups,
      ),
      'sync-template-steps': countTemplateStepMismatches(filesystem.templateSteps, normalizedDbTemplateSteps),
      'sync-locator-groups': countLocatorGroupMismatches(filesystem.locatorGroups, dbLocatorGroups, modulePathMap),
      'sync-locators': countLocatorMismatches(filesystem.locatorFiles, dbLocatorGroups),
      'sync-test-suites': countTestSuiteMismatches(filesystem.testSuites, dbTestSuites, modulePathMap),
      'sync-test-cases': countTestCaseMismatches(
        filesystem.testCases,
        dbTestCases,
        modulePathMap,
        normalizedDbTemplateSteps.map(step => ({
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
