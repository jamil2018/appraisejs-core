import { isAlias, parseDocument, stringify, visit } from 'yaml'
import type { ZodError } from 'zod'

import { PlanContractError } from './errors'
import { artifactSchemas, type ArtifactKind } from './schemas'

export const MAX_ARTIFACT_BYTES = 1024 * 1024

function assertSize(source: string): void {
  if (Buffer.byteLength(source, 'utf8') > MAX_ARTIFACT_BYTES) {
    throw new PlanContractError('artifact-too-large', 'Artifact exceeds the 1 MB limit')
  }
}

function mapSchemaError(error: ZodError): PlanContractError {
  const issue = error.issues[0]
  const path = issue.path.map(String)
  if (path.at(-1) === 'version') {
    return new PlanContractError('unknown-version', 'Unsupported artifact version', path)
  }
  if (issue.code === 'invalid_string' && issue.validation === 'datetime') {
    return new PlanContractError('invalid-timestamp', 'Invalid ISO 8601 timestamp', path)
  }
  if (issue.code === 'unrecognized_keys' && issue.keys.some(key => ['evidence', 'results'].includes(key))) {
    return new PlanContractError('runtime-owned-field', 'Runtime-owned fields cannot be authored in artifacts', path)
  }
  return new PlanContractError('invalid-artifact', issue.message, path)
}

function validateArtifact(kind: ArtifactKind, value: unknown): unknown {
  try {
    return artifactSchemas[kind].parse(value)
  } catch (error) {
    if (error instanceof PlanContractError) {
      throw error
    }
    throw mapSchemaError(error as ZodError)
  }
}

function assertNoYamlReferences(document: ReturnType<typeof parseDocument>): void {
  let blockedReference: 'anchor' | 'alias' | undefined
  visit(document, {
    Alias() {
      blockedReference = 'alias'
      return visit.BREAK
    },
    Node(_, node) {
      if (node && 'anchor' in node && node.anchor) {
        blockedReference = 'anchor'
        return visit.BREAK
      }
      if (isAlias(node)) {
        blockedReference = 'alias'
        return visit.BREAK
      }
    },
  })
  if (blockedReference) {
    throw new PlanContractError('unsafe-alias', `YAML ${blockedReference}s are not allowed`)
  }
}

export function parseJsonArtifact(kind: ArtifactKind, source: string): unknown {
  assertSize(source)
  try {
    return validateArtifact(kind, JSON.parse(source))
  } catch (error) {
    if (error instanceof PlanContractError) {
      throw error
    }
    throw new PlanContractError('invalid-artifact', 'Invalid JSON artifact')
  }
}

export function parseYamlArtifact(kind: Exclude<ArtifactKind, 'layout'>, source: string): unknown {
  assertSize(source)
  const document = parseDocument(source, {
    prettyErrors: false,
    strict: true,
    uniqueKeys: true,
  })

  if (document.errors.length > 0) {
    const error = document.errors[0]
    if (error.code === 'DUPLICATE_KEY') {
      throw new PlanContractError('duplicate-key', 'YAML map keys must be unique')
    }
    if (/alias/i.test(error.message)) {
      throw new PlanContractError('unsafe-alias', 'YAML aliases are not allowed')
    }
    throw new PlanContractError('invalid-artifact', 'Invalid YAML artifact')
  }

  assertNoYamlReferences(document)

  return validateArtifact(kind, document.toJS({ maxAliasCount: 0 }))
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize)
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    )
  }
  return value
}

export function serializeJsonArtifact(kind: ArtifactKind, value: unknown): string {
  return `${JSON.stringify(validateArtifact(kind, value), null, 2)}\n`
}

export function serializeYamlArtifact(kind: Exclude<ArtifactKind, 'layout'>, value: unknown): string {
  return stringify(canonicalize(validateArtifact(kind, value)), {
    aliasDuplicateObjects: false,
    lineWidth: 0,
  }).replace(/\r\n?/g, '\n')
}
