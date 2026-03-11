import { readFile } from 'fs/promises'
import { StepStatus, StepKeyword } from '@prisma/client'

/**
 * Parsed report structure matching cucumber.json format
 */
export interface ParsedReport {
  features: Array<{
    name: string
    description: string
    uri: string
    line: number
    keyword: string
    tags: Array<{ name: string; line: number }>
    scenarios: Array<{
      name: string
      description: string
      line: number
      keyword: string
      type: string
      cucumberId: string
      tags: Array<{ name: string; line: number }>
      steps: Array<{
        keyword: string
        line: number | null
        name: string
        matchLocation?: string
        status: string
        duration: number
        errorMessage?: string
        errorTrace?: string
        hidden: boolean
        order: number
      }>
      hooks: Array<{
        keyword: string
        status: string
        duration: number
        errorMessage?: string
        errorTrace?: string
        hidden: boolean
      }>
    }>
  }>
}

/**
 * Cucumber JSON report structure (as received from cucumber-js)
 */
interface CucumberJsonFeature {
  description: string
  elements: Array<{
    description: string
    id: string
    keyword: string
    line: number
    name: string
    steps: Array<{
      keyword: string
      line?: number
      name?: string
      hidden?: boolean
      match?: {
        location: string
      }
      result?: {
        status: string
        duration?: number
        error_message?: string
      }
    }>
    tags: Array<{
      name: string
      line: number
    }>
    type: string
  }>
  id: string
  line: number
  keyword: string
  name: string
  tags: Array<{
    name: string
    line: number
  }>
  uri: string
}

/**
 * Maps cucumber step status to Prisma StepStatus enum
 */
function mapStepStatus(status: string): StepStatus {
  const upperStatus = status.toUpperCase()
  switch (upperStatus) {
    case 'PASSED':
      return StepStatus.PASSED
    case 'FAILED':
      return StepStatus.FAILED
    case 'SKIPPED':
      return StepStatus.SKIPPED
    case 'PENDING':
      return StepStatus.PENDING
    case 'UNDEFINED':
      return StepStatus.UNDEFINED
    default:
      return StepStatus.PENDING
  }
}

/**
 * Maps cucumber step keyword to Prisma StepKeyword enum
 */
function mapStepKeyword(keyword: string): StepKeyword {
  const trimmedKeyword = keyword.trim()
  const upperKeyword = trimmedKeyword.toUpperCase()
  switch (upperKeyword) {
    case 'GIVEN':
      return StepKeyword.GIVEN
    case 'WHEN':
      return StepKeyword.WHEN
    case 'THEN':
      return StepKeyword.THEN
    case 'AND':
      return StepKeyword.AND
    case 'BUT':
      return StepKeyword.BUT
    case 'BEFORE':
      return StepKeyword.BEFORE
    case 'AFTER':
      return StepKeyword.AFTER
    default:
      // Default to GIVEN for unknown keywords
      return StepKeyword.GIVEN
  }
}

/**
 * Separates error message from stack trace
 * Cucumber's error_message typically contains both the error message and stack trace
 * The stack trace usually starts with "at" or contains file paths
 *
 * @param errorMessage - The full error message from Cucumber
 * @returns Object with separated message and trace
 */
function separateErrorMessageAndTrace(errorMessage: string | undefined): {
  message: string | undefined
  trace: string | undefined
} {
  if (!errorMessage) {
    return { message: undefined, trace: undefined }
  }

  // Look for common stack trace indicators
  // Stack traces typically start with "at", "    at", or contain file paths with line numbers
  const stackTracePatterns = [
    /\n\s*at\s/, // "at" at the start of a line (with optional whitespace)
    /\n\s+at\s/, // "at" with leading whitespace
    /Error:\s*$/m, // Error: at end of line (message ends, trace starts)
  ]

  // Find the first occurrence of a stack trace pattern
  let splitIndex = -1
  for (const pattern of stackTracePatterns) {
    const match = errorMessage.match(pattern)
    if (match && match.index !== undefined) {
      // If we find "at" pattern, split before it (include the newline before "at")
      // If we find "Error:" pattern, split after it
      if (pattern.source.includes('Error:')) {
        splitIndex = match.index + match[0].length
      } else {
        splitIndex = match.index
      }
      break
    }
  }

  // If no stack trace pattern found, check if it looks like just a message (short, no file paths)
  if (splitIndex === -1) {
    // Check if it contains file paths (common in stack traces)
    const hasFilePath = /[\/\\][\w\-\.]+:\d+/.test(errorMessage)
    if (hasFilePath && errorMessage.length > 200) {
      // Likely contains a trace, try to find where message ends
      // Usually the first few lines are the message, rest is trace
      const lines = errorMessage.split('\n')
      // Look for the first line that starts with whitespace and "at" or contains a file path
      for (let i = 0; i < lines.length; i++) {
        if (/^\s*at\s/.test(lines[i]) || /[\/\\][\w\-\.]+:\d+/.test(lines[i])) {
          splitIndex = errorMessage.indexOf(lines[i])
          break
        }
      }
    }
  }

  if (splitIndex > 0) {
    const message = errorMessage.substring(0, splitIndex).trim()
    const trace = errorMessage.substring(splitIndex).trim()
    return {
      message: message || undefined,
      trace: trace || undefined,
    }
  }

  // If we can't separate them, treat the whole thing as the message
  // and leave trace as undefined (better than duplicating)
  return {
    message: errorMessage.trim() || undefined,
    trace: undefined,
  }
}

/**
 * Parses a cucumber.json report file into a structured ParsedReport object
 *
 * @param reportPath - Path to the cucumber.json file
 * @returns Parsed report structure
 * @throws Error if file cannot be read or parsed
 */
export async function parseCucumberReport(reportPath: string): Promise<ParsedReport> {
  try {
    // Read the report file
    const fileContent = await readFile(reportPath, 'utf-8')
    const cucumberData: CucumberJsonFeature[] = JSON.parse(fileContent)

    // Parse features
    const features = cucumberData.map(feature => {
      // Separate steps into regular steps and hooks
      const scenarios = feature.elements.map(element => {
        const steps: ParsedReport['features'][0]['scenarios'][0]['steps'] = []
        const hooks: ParsedReport['features'][0]['scenarios'][0]['hooks'] = []

        element.steps.forEach((step, index) => {
          const isHook = step.keyword === 'Before' || step.keyword === 'After'
          const stepStatus = step.result?.status || 'pending'
          const duration = step.result?.duration || 0

          // Separate error message from stack trace
          const { message: errorMessage, trace: errorTrace } = separateErrorMessageAndTrace(step.result?.error_message)

          if (isHook) {
            hooks.push({
              keyword: step.keyword,
              status: stepStatus,
              duration,
              errorMessage,
              errorTrace,
              hidden: step.hidden || false,
            })
          } else {
            steps.push({
              keyword: step.keyword.trim(),
              line: step.line || null,
              name: step.name || '',
              matchLocation: step.match?.location,
              status: stepStatus,
              duration,
              errorMessage,
              errorTrace,
              hidden: step.hidden || false,
              order: index,
            })
          }
        })

        return {
          name: element.name,
          description: element.description || '',
          line: element.line,
          keyword: element.keyword,
          type: element.type,
          cucumberId: element.id,
          tags: element.tags.map(tag => ({
            name: tag.name,
            line: tag.line,
          })),
          steps,
          hooks,
        }
      })

      return {
        name: feature.name,
        description: feature.description || '',
        uri: feature.uri,
        line: feature.line,
        keyword: feature.keyword,
        tags: feature.tags.map(tag => ({
          name: tag.name,
          line: tag.line,
        })),
        scenarios,
      }
    })

    return { features }
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to parse cucumber report at ${reportPath}: ${error.message}`)
    }
    throw new Error(`Failed to parse cucumber report at ${reportPath}: Unknown error`)
  }
}

/**
 * Helper function to convert parsed step status to Prisma enum
 */
export function getStepStatusEnum(status: string): StepStatus {
  return mapStepStatus(status)
}

/**
 * Helper function to convert parsed step keyword to Prisma enum
 */
export function getStepKeywordEnum(keyword: string): StepKeyword {
  return mapStepKeyword(keyword)
}
