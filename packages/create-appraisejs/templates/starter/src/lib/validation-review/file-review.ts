import { createHash } from 'node:crypto'
import path from 'node:path'

const FILE_CLASSIFICATIONS = ['test_only', 'test_infrastructure', 'production', 'requires_review'] as const

export type FileClassification = (typeof FILE_CLASSIFICATIONS)[number]
export type FileClassificationOverride = { pattern: string; classification: FileClassification }
export type FileSnapshot = Record<string, string>
export type FileReviewDelta = {
  path: string
  classification: FileClassification
  rationale: string
  status: 'added' | 'modified' | 'deleted'
  beforeHash: string | null
  contentHash: string | null
  patch: string
  declared: boolean
}

const TEST_FILE = /(^|\/)(__tests__|tests?|e2e|features?|fixtures?)(\/|$)|\.(test|spec)\.[^.]+$/
const TEST_INFRASTRUCTURE =
  /(^|\/)(playwright|cucumber|vitest|jest)\.(config|setup)|(^|\/)(scripts|automation|src\/tests\/steps)(\/|$)/
const REVIEW_REQUIRED = /(^|\/)(package(-lock)?\.json|prisma\/|migrations?\/|\.github\/|Dockerfile|.*\.config\.)/

function globMatches(filePath: string, pattern: string): boolean {
  const expression = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replaceAll('**', '\0')
    .replaceAll('*', '[^/]*')
    .replaceAll('\0', '.*')
  return new RegExp(`^${expression}$`).test(filePath)
}

export function hashFileContent(content: string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
}

export function classifyFile(
  filePath: string,
  overrides: FileClassificationOverride[] = [],
): { classification: FileClassification; rationale: string } {
  const normalized = filePath.split(path.sep).join('/')
  const matches = overrides.filter(override => globMatches(normalized, override.pattern))
  if (matches.length > 1) {
    throw new Error(
      `Ambiguous file classification for ${normalized}: ${matches.map(match => match.pattern).join(', ')}`,
    )
  }
  if (matches[0]) {
    return {
      classification: matches[0].classification,
      rationale: `Repository override: ${matches[0].pattern}`,
    }
  }
  if (TEST_FILE.test(normalized)) return { classification: 'test_only', rationale: 'Default test file policy' }
  if (TEST_INFRASTRUCTURE.test(normalized)) {
    return { classification: 'test_infrastructure', rationale: 'Default test infrastructure policy' }
  }
  if (REVIEW_REQUIRED.test(normalized)) {
    return { classification: 'requires_review', rationale: 'Default sensitive infrastructure policy' }
  }
  return { classification: 'production', rationale: 'Default production policy' }
}

function patch(pathname: string, before: string | undefined, after: string | undefined): string {
  return [
    `--- a/${pathname}`,
    `+++ b/${pathname}`,
    ...(before === undefined ? [] : before.split('\n').map(line => `-${line}`)),
    ...(after === undefined ? [] : after.split('\n').map(line => `+${line}`)),
  ].join('\n')
}

export function computeFileReviewDeltas(input: {
  baseline: FileSnapshot
  current: FileSnapshot
  preparationStart?: FileSnapshot
  manifestPaths: string[]
  overrides?: FileClassificationOverride[]
}): FileReviewDelta[] {
  const paths = new Set([...Object.keys(input.baseline), ...Object.keys(input.current)])
  return [...paths]
    .sort()
    .filter(filePath => input.baseline[filePath] !== input.current[filePath])
    .filter(
      filePath =>
        !input.preparationStart ||
        input.preparationStart[filePath] === input.baseline[filePath] ||
        input.current[filePath] !== input.preparationStart[filePath],
    )
    .map(filePath => {
      const before = input.preparationStart?.[filePath] ?? input.baseline[filePath]
      const after = input.current[filePath]
      const policy = classifyFile(filePath, input.overrides)
      return {
        path: filePath,
        ...policy,
        status: before === undefined ? 'added' : after === undefined ? 'deleted' : 'modified',
        beforeHash: before === undefined ? null : hashFileContent(before),
        contentHash: after === undefined ? null : hashFileContent(after),
        patch: patch(filePath, before, after),
        declared: input.manifestPaths.includes(filePath),
      }
    })
}

export function reconcileManifest(deltas: FileReviewDelta[], manifestPaths: string[]) {
  const actualPaths = new Set(deltas.map(delta => delta.path))
  return {
    undeclared: deltas.filter(delta => !delta.declared).map(delta => delta.path),
    missing: manifestPaths.filter(filePath => !actualPaths.has(filePath)),
  }
}
