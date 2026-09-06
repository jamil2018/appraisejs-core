import { createHash } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'

import {
  computeStepDefinitionHashes,
  computeStepReferenceHash,
  stepDefinitionSchema,
} from '../../../packages/cucumber-runtime/src/step-definitions/index.ts'
import { stepDiscoveryTerms } from '@/lib/step-discovery'

export type ReadyStepDefinitionRow = {
  id: string
  version: string
  title: string
  description: string
  definitionJson: string
}

type IndexedDefinition = {
  row: ReadyStepDefinitionRow
  value: ReturnType<typeof parseReadyStepDefinition>
  terms: Set<string>
  text: string
}

const cachedIndexes = new Map<string, IndexedDefinition[]>()
const cachedReadyRows = new Map<string, ReadyStepDefinitionRow[]>()

function indexHash(rows: ReadyStepDefinitionRow[]) {
  return `sha256:${createHash('sha256')
    .update(
      rows
        .map(row => `${row.id}@${row.version}:${row.definitionJson}`)
        .sort()
        .join('\n'),
    )
    .digest('hex')}`
}

export function readyStepDefinitionSearchIndexHash(rows: ReadyStepDefinitionRow[]) {
  return indexHash(rows)
}

/** Manifest-keyed cache: normal searches read compact ready metadata only. Full
 * definition JSON is loaded only when publication/deprecation changes the manifest. */
export async function readyStepDefinitionRowsForSearch(database: PrismaClient) {
  const manifest = await database.stepDefinition.findMany({
    where: { status: 'ready' },
    select: { id: true, version: true, definitionHash: true },
    orderBy: [{ id: 'asc' }, { version: 'asc' }],
  })
  const manifestHash = `sha256:${createHash('sha256').update(JSON.stringify(manifest)).digest('hex')}`
  const cached = cachedReadyRows.get(manifestHash)
  if (cached) return cached
  const rows = await database.stepDefinition.findMany({
    where: { status: 'ready' },
    select: { id: true, version: true, title: true, description: true, definitionJson: true },
    orderBy: [{ id: 'asc' }, { version: 'asc' }],
  })
  cachedReadyRows.clear()
  cachedReadyRows.set(manifestHash, rows)
  return rows
}

function parseReadyStepDefinition(row: ReadyStepDefinitionRow) {
  const definition = stepDefinitionSchema.parse(JSON.parse(row.definitionJson))
  return {
    step: { id: row.id, version: row.version, definitionHash: computeStepReferenceHash(definition) },
    title: row.title,
    description: row.description,
    agent: definition.agent,
    human: definition.human,
    inputs: definition.inputs,
    outputs: definition.outputs,
    integrity: computeStepDefinitionHashes(definition),
  }
}

/** Content-addressed, process-local index. Its key is the immutable ready row content,
 * so callers never need a lossy SQL text prefilter before semantic ranking. */
function readyStepDefinitionSearchIndex(rows: ReadyStepDefinitionRow[]) {
  const key = indexHash(rows)
  const cached = cachedIndexes.get(key)
  if (cached) return { key, entries: cached }
  const entries = rows.map(row => {
    const value = parseReadyStepDefinition(row)
    const text = [row.id, row.title, row.description, JSON.stringify(value.agent), value.human.signature].join(' ')
    return { row, value, text: text.toLowerCase(), terms: stepDiscoveryTerms(text) }
  })
  cachedIndexes.set(key, entries)
  return { key, entries }
}

export function createReadySearchEvidence(input: {
  indexHash: string
  searchedAt: string
  journeyId?: string
  correlationId: string
  candidateReferences: Array<{ id: string; version: string }>
}) {
  const candidateReferences = [...input.candidateReferences]
    .sort((left, right) => `${left.id}@${left.version}`.localeCompare(`${right.id}@${right.version}`))
    .slice(0, 25)
  const body = {
    indexHash: input.indexHash,
    searchedAt: input.searchedAt,
    ...(input.journeyId ? { journeyId: input.journeyId } : {}),
    correlationId: input.correlationId,
    candidateReferences,
  }
  return body
}

function contextTerms(value: string | undefined) {
  return value ? stepDiscoveryTerms(value) : new Set<string>()
}

type ReadySearchInput = {
  intent: string
  parameterNames?: string[]
  planContext?: string
  includeUnmatched?: boolean
}

function phraseScore(text: string, intent: string) {
  const phrase = intent.trim().toLowerCase()
  if (phrase.length === 0) return 0
  if (text === phrase) return 8
  return text.includes(phrase) ? 5 : 0
}

function parameterMatchSummary(entry: IndexedDefinition, requestedParameters: Set<string>) {
  const availableParameters = entry.value.inputs.map(parameter => parameter.name.toLowerCase())
  const namedMatches = [...requestedParameters].filter(name => availableParameters.includes(name)).length
  const positionalFallback =
    requestedParameters.size > 0 && namedMatches === 0 && availableParameters.length >= requestedParameters.size
      ? 0.25
      : 0
  const compatibility =
    requestedParameters.size === 0 ? 1 : (namedMatches + positionalFallback) / requestedParameters.size
  return { namedMatches, positionalFallback, compatibility }
}

function termCoverage(matchedTerms: string[], requestedTerms: Set<string>) {
  return requestedTerms.size === 0 ? 0 : matchedTerms.length / requestedTerms.size
}

function rankReadyStepDefinition(
  entry: IndexedDefinition,
  input: ReadySearchInput,
  requestedTerms: Set<string>,
  planTerms: Set<string>,
  requestedParameters: Set<string>,
  indexHash: string,
) {
  const matchedTerms = [...requestedTerms].filter(term => entry.terms.has(term))
  const planMatches = [...planTerms].filter(term => entry.terms.has(term)).length
  const { namedMatches, positionalFallback, compatibility } = parameterMatchSummary(entry, requestedParameters)
  const score =
    matchedTerms.length +
    phraseScore(entry.text, input.intent) +
    namedMatches * 2 +
    positionalFallback +
    Math.min(planMatches, 3) * 0.2
  const confidence = Math.min(1, termCoverage(matchedTerms, requestedTerms) * 0.8 + compatibility * 0.2)
  return {
    value: entry.value,
    score,
    confidence,
    matchedTerms,
    parameterCompatibility: compatibility,
    indexHash,
    explanation: `Matched ${matchedTerms.length} intent term(s); ${namedMatches}/${requestedParameters.size} requested parameter name(s) match the ready Step Definition.`,
  }
}

export function searchReadyStepDefinitions(rows: ReadyStepDefinitionRow[], input: ReadySearchInput) {
  const requestedTerms = stepDiscoveryTerms(input.intent)
  const planTerms = contextTerms(input.planContext)
  const requestedParameters = new Set(
    (input.parameterNames ?? []).map(name => name.trim().toLowerCase()).filter(Boolean),
  )
  const index = readyStepDefinitionSearchIndex(rows)
  return index.entries
    .map(entry => rankReadyStepDefinition(entry, input, requestedTerms, planTerms, requestedParameters, index.key))
    .filter(candidate => candidate.score > 0 || input.includeUnmatched)
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.confidence - left.confidence ||
        left.value.title.localeCompare(right.value.title),
    )
}
