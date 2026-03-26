import { parse } from '@babel/parser'
import _traverse from '@babel/traverse'
import type { NodePath } from '@babel/traverse'
import * as t from '@babel/types'
import { StepParameterType, TemplateStepIcon } from '@prisma/client'
import { parseGroupJSDoc, StepGroupJSDoc } from './jsdoc-parser'

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
  functionDefinition: string
  parameters: StepParameter[]
  keyword: 'When' | 'Then' | 'Given'
}

export interface StepData {
  group: StepGroupJSDoc
  steps: ParsedStep[]
  filePath: string
}

/**
 * Reads the nearest preceding JSDoc block for a step call and extracts metadata.
 */
export function parseStepJSDoc(content: string, startLine: number): StepJSDoc | null {
  const lines = content.split('\n')
  let jsdocStart = -1
  for (let i = startLine - 1; i >= 0 && i >= startLine - 20; i--) {
    const line = lines[i]?.trim()
    if (line?.includes('*/')) {
      jsdocStart = i
      for (let j = i - 1; j >= 0 && j >= i - 10; j--) {
        const prevLine = lines[j]?.trim()
        if (prevLine?.startsWith('/**')) {
          jsdocStart = j
          break
        }
      }
      break
    } else if (line?.startsWith('/**')) {
      jsdocStart = i
      break
    }
  }

  if (jsdocStart === -1) return null

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

    if (foundJSDoc) {
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
  }

  if (!name || !icon) return null

  const iconUpper = icon.toUpperCase()
  const validIcons = Object.values(TemplateStepIcon)
  if (!validIcons.includes(iconUpper as TemplateStepIcon)) {
    throw new Error(`Invalid @icon value: ${icon}. Must be one of: ${validIcons.join(', ')}`)
  }

  return {
    name: name.trim(),
    description: description ? description.trim() : null,
    icon: iconUpper as TemplateStepIcon,
  }
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
      const node = path.node
      const callee = node.callee
      let keyword: 'When' | 'Then' | 'Given' | null = null
      if (t.isIdentifier(callee) && (callee.name === 'When' || callee.name === 'Then' || callee.name === 'Given')) {
        keyword = callee.name as 'When' | 'Then' | 'Given'
      }

      if (!keyword || node.arguments.length < 2) return

      const patternArg = node.arguments[0]
      if (!t.isStringLiteral(patternArg)) return
      const signature = patternArg.value

      const funcArg = node.arguments[1]
      if (!t.isFunction(funcArg)) return

      const lineNumber = node.loc?.start?.line
      if (lineNumber === undefined) return

      const jsdoc = parseStepJSDoc(content, lineNumber - 1)
      if (!jsdoc) return

      const parameters: StepParameter[] = []
      let order = 0
      for (const param of funcArg.params) {
        if (t.isIdentifier(param) && param.name === 'this') continue
        if (t.isObjectPattern(param) && param.properties.length === 1) {
          const prop = param.properties[0]
          if (t.isObjectProperty(prop) && t.isIdentifier(prop.key) && prop.key.name === 'this') continue
        }

        let paramName: string | null = null
        let paramType: string | null = null

        if (t.isIdentifier(param)) {
          paramName = param.name
          if (param.typeAnnotation && t.isTSTypeAnnotation(param.typeAnnotation)) {
            const typeAnnotation = param.typeAnnotation.typeAnnotation
            if (t.isTSTypeReference(typeAnnotation) && t.isIdentifier(typeAnnotation.typeName)) {
              paramType = typeAnnotation.typeName.name
            } else if (t.isTSStringKeyword(typeAnnotation)) {
              paramType = 'string'
            } else if (t.isTSNumberKeyword(typeAnnotation)) {
              paramType = 'number'
            } else if (t.isTSBooleanKeyword(typeAnnotation)) {
              paramType = 'boolean'
            }
          }
        }

        if (paramName && paramType) {
          const mappedType = mapTypeToParameterType(paramType)
          parameters.push({ name: paramName, type: mappedType, order: order++ })
        }
      }

      const functionDefinition = extractFunctionDefinition(node, content)
      steps.push({
        jsdoc,
        signature,
        functionDefinition,
        parameters,
        keyword,
      })
    },
  })

  return { group, steps, filePath }
}
