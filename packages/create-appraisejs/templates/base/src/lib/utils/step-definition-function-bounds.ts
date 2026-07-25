export type StepFunctionBounds = {
  startLine: number
  endLine: number
}

type DelimiterCounts = {
  braceCount: number
  parenCount: number
  startParenFound: boolean
}

const STEP_DEFINITION_PREFIXES = ['When(', 'Then(']

function isStepDefinitionStart(trimmedLine: string) {
  return STEP_DEFINITION_PREFIXES.some(prefix => trimmedLine.startsWith(prefix))
}

function isJSDocLine(trimmedLine: string) {
  return (
    trimmedLine.startsWith('/**') ||
    trimmedLine === '*/' ||
    (trimmedLine.startsWith('*') && !isStepDefinitionStart(trimmedLine))
  )
}

function containsFunctionStart(line: string) {
  return line.includes('async function') || line.includes('function(')
}

function hasMatchingSignature(lines: string[], startLine: number, signature: string) {
  let currentSignature = ''

  for (let lineIndex = startLine; lineIndex < lines.length; lineIndex++) {
    const currentLine = lines[lineIndex]
    currentSignature += currentLine

    if (currentSignature.includes(signature)) {
      return true
    }

    if (containsFunctionStart(currentLine)) {
      return false
    }
  }

  return false
}

function findJSDocStartLine(lines: string[], functionLine: number) {
  const lineBeforeFunction = functionLine - 1
  if (lineBeforeFunction < 0 || lines[lineBeforeFunction].trim() !== '*/') {
    return functionLine
  }

  for (let lineIndex = lineBeforeFunction - 1; lineIndex >= 0; lineIndex--) {
    const previousLine = lines[lineIndex].trim()

    if (previousLine.startsWith('/**')) {
      return lineIndex
    }

    if (!previousLine.startsWith('*') && previousLine !== '') {
      return functionLine
    }
  }

  return functionLine
}

function countLineDelimiters(line: string, counts: DelimiterCounts) {
  for (const char of line) {
    if (char === '(') {
      counts.parenCount++
      counts.startParenFound = true
    } else if (char === ')') {
      counts.parenCount--
    } else if (char === '{') {
      counts.braceCount++
    } else if (char === '}') {
      counts.braceCount--
    }
  }
}

function isBalancedStepCall(counts: DelimiterCounts) {
  return counts.startParenFound && counts.parenCount === 0 && counts.braceCount === 0
}

function findStepCallEndLine(lines: string[], functionLine: number) {
  const counts: DelimiterCounts = {
    braceCount: 0,
    parenCount: 0,
    startParenFound: false,
  }

  for (let lineIndex = functionLine; lineIndex < lines.length; lineIndex++) {
    countLineDelimiters(lines[lineIndex], counts)

    if (isBalancedStepCall(counts)) {
      return lineIndex
    }
  }

  return null
}

/**
 * Finds the start and end lines of a step definition function in the file.
 * Handles prettier-wrapped signatures and a JSDoc block directly above the step.
 */
export function findStepFunctionBounds(content: string, signature: string): StepFunctionBounds | null {
  const lines = content.split('\n')

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const trimmedLine = lines[lineIndex].trim()

    if (isJSDocLine(trimmedLine) || !isStepDefinitionStart(trimmedLine)) {
      continue
    }

    if (!hasMatchingSignature(lines, lineIndex, signature)) {
      continue
    }

    const endLine = findStepCallEndLine(lines, lineIndex)
    if (endLine === null) {
      console.warn(`Could not find end of function for signature: ${signature}`)
      return null
    }

    return {
      startLine: findJSDocStartLine(lines, lineIndex),
      endLine,
    }
  }

  return null
}
