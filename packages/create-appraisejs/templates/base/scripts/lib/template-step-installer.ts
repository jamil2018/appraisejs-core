import { promises as fs } from 'fs'
import path from 'path'
import prettier from 'prettier'
import { parse } from '@babel/parser'
import * as t from '@babel/types'
import { glob } from 'glob'
import { TemplateStepGroupType, TemplateStepIcon } from '@prisma/client'
import { createContentSha256, type RegistryStepEntry } from './template-step-registry'
import { parseStepFile } from './step-file-parser'

export type TemplateStepInstallPayload = {
  version: 1
  step: RegistryStepEntry
  source: string
}

export type InstallTemplateStepOptions = {
  projectRoot: string
  overwrite?: boolean
  dryRun?: boolean
}

export type InstallTemplateStepResult = {
  status: 'installed' | 'noop'
  targetFilePath: string
  createdGroupFile: boolean
  changed: boolean
  reason: string
}

type ExistingStepMatch = {
  filePath: string
  source: string
}

const STEP_FILE_PATTERNS = [
  'automation/steps/actions/**/*.step.ts',
  'automation/steps/validations/**/*.step.ts',
] as const
const RUNTIME_IMPORT_PATH = '../../../packages/cucumber-runtime/src/index.js'
const REQUIRED_RUNTIME_IMPORTS = [
  'When',
  'Then',
  'CustomWorld',
  'expect',
  'SelectorName',
  'resolveLocator',
  'getEnvironment',
  'generateRandomData',
  'RandomDataType',
] as const
const PLACEHOLDER_COMMENT =
  '// This file is generated automatically. Add template steps to this group to generate content.'

function parseTypeScriptModule(content: string) {
  return parse(content, {
    sourceType: 'module',
    plugins: ['typescript', 'decorators-legacy'],
  })
}

function getGroupFileName(groupName: string): string {
  return groupName
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
}

function getGroupDirectoryName(type: TemplateStepGroupType): 'actions' | 'validations' {
  return type === 'ACTION' ? 'actions' : 'validations'
}

function getGroupFilePath(projectRoot: string, groupName: string, type: TemplateStepGroupType): string {
  return path.join(
    projectRoot,
    'automation',
    'steps',
    getGroupDirectoryName(type),
    `${getGroupFileName(groupName)}.step.ts`,
  )
}

function generateGroupJSDoc(name: string, description: string | null, type: TemplateStepGroupType): string {
  const lines = ['/**', ` * @name ${name}`]
  if (description) {
    lines.push(` * @description ${description}`)
  }
  lines.push(` * @type ${type}`, ' */')
  return lines.join('\n')
}

function extractGroupJSDocRange(content: string): { start: number; end: number } | null {
  const match = content.match(/^\/\*\*[\s\S]*?\*\//)
  if (!match || !match[0].includes('@type')) {
    return null
  }

  return {
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }
}

function renderRequiredRuntimeImport(extraImports: string[] = []): string {
  const orderedNames = [
    ...REQUIRED_RUNTIME_IMPORTS,
    ...extraImports
      .filter(name => !REQUIRED_RUNTIME_IMPORTS.includes(name as (typeof REQUIRED_RUNTIME_IMPORTS)[number]))
      .sort((left, right) => left.localeCompare(right)),
  ]

  return `import { ${orderedNames.join(', ')} } from '${RUNTIME_IMPORT_PATH}'`
}

function mergeImports(content: string): string {
  const ast = parseTypeScriptModule(content)
  const importNodes = ast.program.body.filter(node => t.isImportDeclaration(node)) as t.ImportDeclaration[]
  const preservedImports: string[] = []
  const runtimeNamedImports = new Set<string>()
  const complexRuntimeImports: string[] = []

  for (const node of importNodes) {
    const code = content.slice(node.start ?? 0, node.end ?? 0).trim()
    const importSource = node.source.value

    if (importSource !== RUNTIME_IMPORT_PATH) {
      if (code) preservedImports.push(code)
      continue
    }

    let hasComplexSpecifiers = false
    for (const specifier of node.specifiers) {
      if (t.isImportSpecifier(specifier)) {
        runtimeNamedImports.add(specifier.local.name)
      } else {
        hasComplexSpecifiers = true
      }
    }

    if (hasComplexSpecifiers && code) {
      complexRuntimeImports.push(code)
    }
  }

  const imports = [...preservedImports]
  if (runtimeNamedImports.size > 0) {
    imports.push(renderRequiredRuntimeImport(Array.from(runtimeNamedImports)))
  } else {
    imports.push(renderRequiredRuntimeImport())
  }
  imports.push(...complexRuntimeImports)

  return imports.join('\n')
}

async function normalizeTypeScriptSource(source: string): Promise<string> {
  const trimmed = source.trim()
  if (!trimmed) {
    return ''
  }

  try {
    return (
      await prettier.format(trimmed, {
        parser: 'typescript',
        semi: true,
        singleQuote: true,
        trailingComma: 'es5',
        printWidth: 80,
        tabWidth: 2,
      })
    ).trim()
  } catch {
    return trimmed
  }
}

async function ensureDirectoryExists(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
}

async function createPlaceholderGroupFile(
  filePath: string,
  group: RegistryStepEntry['group'],
  dryRun: boolean,
): Promise<boolean> {
  const content = await normalizeTypeScriptSource(
    `${generateGroupJSDoc(group.name, group.description, group.type)}

${renderRequiredRuntimeImport()}

${PLACEHOLDER_COMMENT}
`,
  )

  if (!dryRun) {
    await ensureDirectoryExists(filePath)
    await fs.writeFile(filePath, `${content}\n`, 'utf8')
  }

  return true
}

async function findExistingSignatureMatches(projectRoot: string, signature: string): Promise<ExistingStepMatch[]> {
  const matches: ExistingStepMatch[] = []

  for (const pattern of STEP_FILE_PATTERNS) {
    const files = await glob(pattern, { cwd: projectRoot })
    for (const relativePath of files) {
      const absolutePath = path.join(projectRoot, relativePath)
      const content = await fs.readFile(absolutePath, 'utf8')
      const parsed = parseStepFile(content, relativePath)
      if (!parsed) {
        continue
      }

      for (const step of parsed.steps) {
        if (step.signature === signature) {
          matches.push({
            filePath: absolutePath,
            source: step.source,
          })
        }
      }
    }
  }

  return matches
}

function validatePayload(payload: TemplateStepInstallPayload): void {
  if (payload.version !== 1) {
    throw new Error(`Unsupported install payload version: ${payload.version}`)
  }

  if (!payload.step.slug || !payload.step.signature || !payload.source.trim()) {
    throw new Error('Install payload is missing required step metadata')
  }

  const expectedSha = createContentSha256(payload.source.endsWith('\n') ? payload.source : `${payload.source}\n`)
  if (expectedSha !== payload.step.sourceSha256) {
    throw new Error(`Downloaded step payload failed checksum validation for ${payload.step.slug}`)
  }
}

async function buildUpdatedGroupFileContent(
  existingContent: string,
  payload: TemplateStepInstallPayload,
  overwrite: boolean,
): Promise<{ changed: boolean; content: string; reason: string }> {
  const parsed = parseStepFile(existingContent, payload.step.sourcePath)
  const groupRange = extractGroupJSDocRange(existingContent)
  const existingSteps = parsed?.steps.slice().sort((left, right) => left.start - right.start) ?? []
  const firstStepStart = existingSteps[0]?.start ?? existingContent.length
  const lastStepEnd = existingSteps[existingSteps.length - 1]?.end ?? 0
  const ast = parseTypeScriptModule(existingContent)
  const importNodes = ast.program.body.filter(node => t.isImportDeclaration(node)) as t.ImportDeclaration[]
  const importsEnd = importNodes[importNodes.length - 1]?.end ?? groupRange?.end ?? 0
  const preamble = existingContent.slice(importsEnd, firstStepStart).trim()
  const postamble = lastStepEnd > 0 ? existingContent.slice(lastStepEnd).trim() : ''
  const normalizedIncomingSource = await normalizeTypeScriptSource(payload.source)
  const matchingIndex = existingSteps.findIndex(step => step.signature === payload.step.signature)

  if (matchingIndex >= 0) {
    const normalizedExistingSource = await normalizeTypeScriptSource(existingSteps[matchingIndex]!.source)
    if (normalizedExistingSource === normalizedIncomingSource) {
      return {
        changed: false,
        content: existingContent,
        reason: `Step "${payload.step.signature}" is already installed.`,
      }
    }

    if (!overwrite) {
      throw new Error(
        `A different step with signature "${payload.step.signature}" already exists in ${payload.step.group.name}. Re-run with --overwrite to replace it.`,
      )
    }

    existingSteps[matchingIndex] = {
      ...existingSteps[matchingIndex]!,
      source: payload.source,
    }
  } else {
    existingSteps.push({
      jsdoc: {
        name: payload.step.name,
        description: payload.step.description,
        icon: payload.step.icon as TemplateStepIcon,
      },
      signature: payload.step.signature,
      source: payload.source,
      start: 0,
      end: 0,
      functionDefinition: payload.source,
      parameters: [],
      keyword: payload.step.group.type === 'ACTION' ? 'When' : 'Then',
    })
  }

  const sections = [
    generateGroupJSDoc(payload.step.group.name, payload.step.group.description, payload.step.group.type),
  ]
  const mergedImports = mergeImports(existingContent)
  if (mergedImports.trim()) {
    sections.push(mergedImports)
  }
  if (preamble) {
    sections.push(preamble)
  }
  sections.push(existingSteps.map(step => step.source.trim()).join('\n\n'))
  if (postamble) {
    sections.push(postamble)
  }

  return {
    changed: true,
    content: `${await normalizeTypeScriptSource(sections.filter(Boolean).join('\n\n'))}\n`,
    reason:
      matchingIndex >= 0
        ? `Replaced step "${payload.step.signature}" in ${payload.step.group.name}.`
        : `Installed step "${payload.step.signature}" into ${payload.step.group.name}.`,
  }
}

export async function installTemplateStepPayload(
  payload: TemplateStepInstallPayload,
  options: InstallTemplateStepOptions,
): Promise<InstallTemplateStepResult> {
  validatePayload(payload)

  const projectRoot = path.resolve(options.projectRoot)
  const overwrite = options.overwrite ?? false
  const dryRun = options.dryRun ?? false
  const targetFilePath = getGroupFilePath(projectRoot, payload.step.group.name, payload.step.group.type)
  const oppositeType = payload.step.group.type === 'ACTION' ? 'VALIDATION' : 'ACTION'
  const oppositeFilePath = getGroupFilePath(projectRoot, payload.step.group.name, oppositeType)

  try {
    await fs.access(oppositeFilePath)
    throw new Error(
      `Found a same-named step group in ${getGroupDirectoryName(oppositeType)} at ${path.relative(projectRoot, oppositeFilePath)}. Move or rename that group before installing this step.`,
    )
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
  }

  const existingMatches = await findExistingSignatureMatches(projectRoot, payload.step.signature)
  const normalizedIncomingSource = await normalizeTypeScriptSource(payload.source)
  for (const match of existingMatches) {
    if (match.filePath !== targetFilePath) {
      const normalizedExistingSource = await normalizeTypeScriptSource(match.source)
      if (normalizedExistingSource === normalizedIncomingSource) {
        return {
          status: 'noop',
          targetFilePath: match.filePath,
          createdGroupFile: false,
          changed: false,
          reason: `Step "${payload.step.signature}" is already installed at ${path.relative(projectRoot, match.filePath)}.`,
        }
      }

      throw new Error(
        `A conflicting step with signature "${payload.step.signature}" already exists at ${path.relative(projectRoot, match.filePath)}.`,
      )
    }
  }

  let createdGroupFile = false
  try {
    await fs.access(targetFilePath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
    createdGroupFile = await createPlaceholderGroupFile(targetFilePath, payload.step.group, dryRun)
  }

  const existingContent = createdGroupFile
    ? await normalizeTypeScriptSource(
        `${generateGroupJSDoc(payload.step.group.name, payload.step.group.description, payload.step.group.type)}

${renderRequiredRuntimeImport()}

${PLACEHOLDER_COMMENT}
`,
      ).then(value => `${value}\n`)
    : await fs.readFile(targetFilePath, 'utf8')

  const updated = await buildUpdatedGroupFileContent(existingContent, payload, overwrite)
  if (!updated.changed) {
    return {
      status: 'noop',
      targetFilePath,
      createdGroupFile,
      changed: false,
      reason: updated.reason,
    }
  }

  if (!dryRun) {
    await ensureDirectoryExists(targetFilePath)
    await fs.writeFile(targetFilePath, updated.content, 'utf8')
  }

  return {
    status: 'installed',
    targetFilePath,
    createdGroupFile,
    changed: true,
    reason: updated.reason,
  }
}
