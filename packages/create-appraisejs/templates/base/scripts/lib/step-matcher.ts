import { StepParameterType, TemplateStepIcon, TemplateStepType } from '@prisma/client'
import { ParsedStep } from '../../src/lib/gherkin-parser'

export interface ParameterMatch {
  name: string
  value: string
  order: number
  type: StepParameterType
}

export interface TemplateStepMatch {
  templateStepId: string
  signature: string
  parameters: ParameterMatch[]
}

type TemplateStepCandidate = {
  id: string
  signature: string
  parameters: Array<{ name: string; order: number; type: StepParameterType }>
}

/**
 * Converts a template-step signature with placeholders to a regex matcher.
 */
export function signatureToRegex(signature: string): RegExp {
  let pattern = signature.replace(/[.*+?^${}()|[\]\\]/g, match => {
    if (match === '{' || match === '}') return match
    return '\\' + match
  })

  pattern = pattern.replace(/\{string\}/g, '"([^"]+)"')
  pattern = pattern.replace(/\{int\}/g, '(\\d+)')
  pattern = pattern.replace(/\{boolean\}/g, '(true|false)')
  pattern = pattern.replace(/\{number\}/g, '(\\d+(?:\\.\\d+)?)')
  return new RegExp(`^${pattern}$`, 'i')
}

/**
 * Resolves captured parameter values from a gherkin step against a signature.
 */
export function extractParametersFromGherkinStep(
  gherkinText: string,
  signature: string,
  templateStepParameters: Array<{ name: string; order: number; type: StepParameterType }>,
): ParameterMatch[] | null {
  const regex = signatureToRegex(signature)
  const match = gherkinText.match(regex)

  if (!match) return null

  const capturedValues = match.slice(1)
  const parameters: ParameterMatch[] = []
  for (let i = 0; i < capturedValues.length && i < templateStepParameters.length; i++) {
    const param = templateStepParameters[i]
    const value = capturedValues[i]
    if (value !== undefined) {
      parameters.push({
        name: param.name,
        value,
        order: param.order,
        type: param.type,
      })
    }
  }

  return parameters
}

/**
 * Finds the first template step whose signature matches the gherkin step text.
 */
export function findMatchingTemplateStep(
  gherkinStep: ParsedStep,
  templateSteps: TemplateStepCandidate[],
): TemplateStepMatch | null {
  for (const templateStep of templateSteps) {
    const parameters = extractParametersFromGherkinStep(
      gherkinStep.text,
      templateStep.signature,
      templateStep.parameters,
    )
    if (parameters) {
      return {
        templateStepId: templateStep.id,
        signature: templateStep.signature,
        parameters,
      }
    }
  }
  return null
}

/**
 * Maps gherkin keyword semantics to template step type + icon.
 */
export function determineStepTypeAndIcon(keyword: string): { type: TemplateStepType; icon: TemplateStepIcon } {
  const lowerKeyword = keyword.toLowerCase().trim()

  if (lowerKeyword === 'given') return { type: 'ACTION', icon: 'NAVIGATION' }
  if (lowerKeyword === 'when') return { type: 'ACTION', icon: 'MOUSE' }
  if (lowerKeyword === 'then') return { type: 'ASSERTION', icon: 'VALIDATION' }
  if (lowerKeyword === 'and' || lowerKeyword === 'but') return { type: 'ACTION', icon: 'MOUSE' }
  return { type: 'ACTION', icon: 'MOUSE' }
}

/**
 * Compares resolved parameter lists in order, including metadata fields.
 */
export function sameResolvedParameters(left: ParameterMatch[], right: ParameterMatch[]): boolean {
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
