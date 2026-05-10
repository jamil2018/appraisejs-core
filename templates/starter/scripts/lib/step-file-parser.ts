import { parse } from '@babel/parser'
import _traverse from '@babel/traverse'
import type { NodePath } from '@babel/traverse'
import * as t from '@babel/types'
import { StepParameterType, TemplateStepIcon } from '@prisma/client'
import { parseGroupJSDoc, readJSDocTag, StepGroupJSDoc } from './jsdoc-parser'

const traverse = (_traverse as { default?: typeof _traverse }).default ?? _traverse

export interface StepJSDoc {
  name: string
  description: string | null
  icon: TemplateStepIcon
}

export interface StepParameter {
  name: string
  type: StepParameterType
  order: number
}

export interface ParsedStep {
  jsdoc: StepJSDoc
  signature: string
  source: string
  start: number
  end: number
  functionDefinition: string
  parameters: StepParameter[]
  keyword: 'When' | 'Then' | 'Given'
}

export interface StepData {
  group: StepGroupJSDoc
  steps: ParsedStep[]
  filePath: string
}

type StepKeyword = ParsedStep['keyword']

function findNearestJSDocStart(lines: string[], startLine: number): number | null {
  for (let i = startLine - 1; i >= 0 && i >= startLine - 20; i--) {
    const line = lines[i]?.trim()

    if (line?.startsWith('/**')) {
      return i
    }

    if (!line?.includes('*/')) {
      continue
    }

    for (let j = i - 1; j >= 0 && j >= i - 10; j--) {
      if (lines[j]?.trim().startsWith('/**')) {
        return j
      }
    }

    return i
  }

  return null
}

function readStepMetadataLine(line: string, metadata: { name: string | null; description: string | null; icon: string | null }) {
  metadata.name = readJSDocTag(line, 'name') ?? metadata.name
  metadata.description = readJSDocTag(line, 'description') ?? metadata.description
  metadata.icon = readJSDocTag(line, 'icon') ?? metadata.icon
}

function normalizeStepIcon(icon: string): TemplateStepIcon {
  const iconUpper = icon.toUpperCase()
  const validIcons = Object.values(TemplateStepIcon)
  if (!validIcons.includes(iconUpper as TemplateStepIcon)) {
    throw new Error(`Invalid @icon value: ${icon}. Must be one of: ${validIcons.join(', ')}`)
  }

  return iconUpper as TemplateStepIcon
}

/**
 * Reads the nearest preceding JSDoc block for a step call and extracts metadata.
 */
export function parseStepJSDoc(content: string, startLine: number): StepJSDoc | null {
  const lines = content.split('\n')
  const jsdocStart = findNearestJSDocStart(lines, startLine)
  if (jsdocStart == null) return null

  const metadata = { name: null as string | null, description: null as string | null, icon: null as string | null }
  for (let i = jsdocStart; i < Math.min(lines.length, jsdocStart + 20); i++) {
    const line = lines[i] ?? ''

    if (line.trim().startsWith('/**')) {
      continue
    }

    if (line.includes('*/')) {
      const beforeClose = line.split('*/')[0].trim()
      readStepMetadataLine(beforeClose, metadata)
      break
    }

    readStepMetadataLine(line, metadata)
  }

  if (!metadata.name || !metadata.icon) return null

  return {
    name: metadata.name.trim(),
    description: metadata.description ? metadata.description.trim() : null,
    icon: normalizeStepIcon(metadata.icon),
  }
}

function findStepJSDocStartOffset(content: string, startLine: number): number | null {
  const lines = content.split('\n')
  const jsdocStart = findNearestJSDocStart(lines, startLine)

  if (jsdocStart == null) {
    return null
  }

  let offset = 0
  for (let i = 0; i < jsdocStart; i++) {
    offset += (lines[i]?.length ?? 0) + 1
  }
  return offset
}

/**
 * Maps TypeScript parameter annotations to persisted step-parameter enum values.
 */
export function mapTypeToParameterType(typeName: string): StepParameterType {
  const normalized = typeName.trim()
  if (normalized === 'SelectorName') return StepParameterType.LOCATOR
  if (normalized === 'string') return StepParameterType.STRING
  if (normalized === 'number' || normalized === 'int') return StepParameterType.NUMBER
  if (normalized === 'boolean') return StepParameterType.BOOLEAN
  if (normalized === 'Date') return StepParameterType.DATE
  throw new Error(
    `Unsupported parameter type: ${typeName}. Supported types: SelectorName, string, number, int, boolean, Date`,
  )
}

/**
 * Extracts exact source for a step definition call expression.
 */
export function extractFunctionDefinition(callExpr: t.CallExpression, sourceCode: string): string {
  const start = callExpr.start
  const end = callExpr.end
  if (start == null || end == null) {
    throw new Error('Cannot extract function definition: missing position information')
  }

  let code = sourceCode.slice(start, end).trim()
  const afterEnd = sourceCode.slice(end, end + 10).trim()
  if (afterEnd.startsWith(';')) code += ';'
  return code
}

/**
 * Extracts exact source for a step definition including its leading step JSDoc.
 */
export function extractStepSource(callExpr: t.CallExpression, sourceCode: string, startLine?: number): string {
  const { start, end } = extractStepSourceRange(callExpr, sourceCode, startLine)
  return sourceCode.slice(start, end).trim()
}

/**
 * Finds the byte range for a step definition including its leading step JSDoc and trailing semicolon.
 */
export function extractStepSourceRange(
  callExpr: t.CallExpression,
  sourceCode: string,
  startLine?: number,
): { start: number; end: number } {
  const callStart = callExpr.start
  const callEnd = callExpr.end
  if (callStart == null || callEnd == null) {
    throw new Error('Cannot extract step source: missing position information')
  }

  const jsdocStart = startLine == null ? null : findStepJSDocStartOffset(sourceCode, startLine)
  const start = jsdocStart ?? callStart

  let end = callEnd
  const trailing = sourceCode.slice(callEnd)
  const semicolonMatch = trailing.match(/^\s*;/)
  if (semicolonMatch) {
    end += semicolonMatch[0].length
  }

  return { start, end }
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
  const funcArg = node.arguments[1]
  return t.isFunction(funcArg) ? funcArg : null
}

function isCucumberWorldParam(param: t.Function['params'][number]): boolean {
  if (t.isIdentifier(param)) {
    return param.name === 'this'
  }

  if (!t.isObjectPattern(param) || param.properties.length !== 1) {
    return false
  }

  const prop = param.properties[0]
  return t.isObjectProperty(prop) && t.isIdentifier(prop.key) && prop.key.name === 'this'
}

function getIdentifierParamType(param: t.Identifier): string | null {
  if (!param.typeAnnotation || !t.isTSTypeAnnotation(param.typeAnnotation)) {
    return null
  }

  const typeAnnotation = param.typeAnnotation.typeAnnotation
  if (t.isTSTypeReference(typeAnnotation) && t.isIdentifier(typeAnnotation.typeName)) {
    return typeAnnotation.typeName.name
  }

  if (t.isTSStringKeyword(typeAnnotation)) return 'string'
  if (t.isTSNumberKeyword(typeAnnotation)) return 'number'
  if (t.isTSBooleanKeyword(typeAnnotation)) return 'boolean'
  return null
}

function parseStepParameters(params: t.Function['params']): StepParameter[] {
  const parameters: StepParameter[] = []

  for (const param of params) {
    if (isCucumberWorldParam(param) || !t.isIdentifier(param)) {
      continue
    }

    const paramType = getIdentifierParamType(param)
    if (!paramType) {
      continue
    }

    parameters.push({
      name: param.name,
      type: mapTypeToParameterType(paramType),
      order: parameters.length,
    })
  }

  return parameters
}

function parseStepCall(node: t.CallExpression, content: string): ParsedStep | null {
  const keyword = getStepKeyword(node)
  if (!keyword || node.arguments.length < 2) return null

  const signature = getStepSignature(node)
  const funcArg = getStepFunction(node)
  const lineNumber = node.loc?.start?.line
  if (!signature || !funcArg || lineNumber === undefined) return null

  const jsdoc = parseStepJSDoc(content, lineNumber - 1)
  if (!jsdoc) return null

  const functionDefinition = extractFunctionDefinition(node, content)
  const { start, end } = extractStepSourceRange(node, content, lineNumber - 1)

  return {
    jsdoc,
    signature,
    source: content.slice(start, end).trim(),
    start,
    end,
    functionDefinition,
    parameters: parseStepParameters(funcArg.params),
    keyword,
  }
}

/**
 * Parses a `.step.ts` file into group + step definitions from AST.
 */
export function parseStepFile(content: string, filePath: string): StepData | null {
  const group = parseGroupJSDoc(content)
  if (!group) return null

  let ast
  try {
    ast = parse(content, {
      sourceType: 'module',
      plugins: ['typescript', 'decorators-legacy'],
    })
  } catch (error) {
    throw new Error(`Failed to parse TypeScript: ${error}`)
  }

  const steps: ParsedStep[] = []

  traverse(ast, {
    CallExpression(path: NodePath<t.CallExpression>) {
      const step = parseStepCall(path.node, content)
      if (step) steps.push(step)
    },
  })

  return { group, steps, filePath }
}
