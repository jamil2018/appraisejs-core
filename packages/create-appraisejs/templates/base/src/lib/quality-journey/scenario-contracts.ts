import { createHash } from 'node:crypto'
import { z } from 'zod'

import { canonicalContractJson } from '@/lib/catalog-contracts'
import {
  qualityJourneyContractVersion,
  qualityJourneyIdentifierSchema,
  sortedUniqueQualityJourneyIdsSchema,
} from './contracts'

const id = qualityJourneyIdentifierSchema
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const text = z.string().trim().min(1).max(8_000)
const sortedIds = sortedUniqueQualityJourneyIdsSchema()

const behavioralIntentSchema = z
  .object({
    title: text,
    narrative: text,
    requirementIds: sortedIds.optional(),
    exploratoryRationale: text.optional(),
    expectedSignals: z.array(text).min(1).max(64),
    steps: z
      .array(z.object({ stepId: id, action: text, expected: text }).strict())
      .min(1)
      .max(128),
  })
  .strict()
  .superRefine((intent, context) => {
    if (!intent.requirementIds?.length && !intent.exploratoryRationale)
      context.addIssue({
        code: 'custom',
        message: 'A scenario needs approved requirement traceability or an exploratory rationale.',
      })
  })

const enrichmentSchema = z
  .object({
    observationIds: sortedIds,
    resourceAssumptionIds: sortedUniqueQualityJourneyIdsSchema({
      min: 0,
      message: 'Resource assumption IDs must be unique and sorted.',
    }),
    feasibilityNotes: z.array(text).max(128),
  })
  .strict()

const layoutSchema = z
  .object({ x: z.number().finite(), y: z.number().finite(), sequence: z.number().int().nonnegative() })
  .strict()

const scenarioRevisionSchema = z
  .object({
    stableScenarioId: id,
    scenarioRevisionId: id,
    behavioralIntent: behavioralIntentSchema,
    enrichment: enrichmentSchema,
    layout: layoutSchema,
  })
  .strict()

const graphEdgeSchema = z
  .object({
    sourceScenarioRevisionId: id,
    targetScenarioRevisionId: id,
    relation: z.enum(['DEPENDS_ON', 'BRANCHES_TO', 'SHARED_SETUP']),
    rationale: text,
  })
  .strict()
const sharedSetupSchema = z.object({ setupId: id, label: text, scenarioRevisionIds: z.array(id).min(2) }).strict()
const scenarioGraphSchema = z
  .object({ edges: z.array(graphEdgeSchema).max(2_048), sharedSetup: z.array(sharedSetupSchema).max(512) })
  .strict()
type ScenarioDraft = z.infer<typeof scenarioRevisionSchema>
type ScenarioGraph = z.infer<typeof scenarioGraphSchema>

function validateScenarioIds(scenarios: ScenarioDraft[], context: z.RefinementCtx) {
  const stableIds = scenarios.map(scenario => scenario.stableScenarioId)
  const revisionIds = scenarios.map(scenario => scenario.scenarioRevisionId)
  if (
    new Set(stableIds).size !== stableIds.length ||
    stableIds.some((value, index) => index && stableIds[index - 1] >= value)
  )
    context.addIssue({ code: 'custom', path: ['scenarios'], message: 'Stable scenario IDs must be unique and sorted.' })
  if (new Set(revisionIds).size !== revisionIds.length)
    context.addIssue({ code: 'custom', path: ['scenarios'], message: 'Scenario revision IDs must be unique.' })
  const sequences = scenarios.map(scenario => scenario.layout.sequence)
  if (new Set(sequences).size !== sequences.length)
    context.addIssue({ code: 'custom', path: ['scenarios'], message: 'Scenario layout sequences must be unique.' })
  return new Set(revisionIds)
}

function validateGraphEdges(edges: ScenarioGraph['edges'], known: Set<string>, context: z.RefinementCtx) {
  const edgeKeys = new Set<string>()
  for (const [index, edge] of edges.entries()) {
    const edgeKey = `${edge.sourceScenarioRevisionId}\u0000${edge.targetScenarioRevisionId}\u0000${edge.relation}`
    if (index && [...edgeKeys].at(-1)! >= edgeKey)
      context.addIssue({
        code: 'custom',
        path: ['graph', 'edges', index],
        message: 'Graph edges must use deterministic source, target, and relation order.',
      })
    if (edgeKeys.has(edgeKey))
      context.addIssue({
        code: 'custom',
        path: ['graph', 'edges', index],
        message: 'Graph edges must not duplicate a dependency or branch relation.',
      })
    edgeKeys.add(edgeKey)
    if (!known.has(edge.sourceScenarioRevisionId) || !known.has(edge.targetScenarioRevisionId))
      context.addIssue({
        code: 'custom',
        path: ['graph', 'edges', index],
        message: 'Graph edges must reference portfolio scenarios.',
      })
    if (edge.sourceScenarioRevisionId === edge.targetScenarioRevisionId)
      context.addIssue({
        code: 'custom',
        path: ['graph', 'edges', index],
        message: 'Graph edges cannot self-reference.',
      })
  }
}

function validateSharedSetups(setups: ScenarioGraph['sharedSetup'], known: Set<string>, context: z.RefinementCtx) {
  const setupIds = setups.map(setup => setup.setupId)
  if (
    new Set(setupIds).size !== setupIds.length ||
    setupIds.some((setupId, index) => index && setupIds[index - 1] >= setupId)
  )
    context.addIssue({
      code: 'custom',
      path: ['graph', 'sharedSetup'],
      message: 'Shared setup IDs must be unique and sorted.',
    })
  for (const [index, setup] of setups.entries()) {
    if (setup.scenarioRevisionIds.some(scenarioRevisionId => !known.has(scenarioRevisionId)))
      context.addIssue({
        code: 'custom',
        path: ['graph', 'sharedSetup', index],
        message: 'Shared setup must reference portfolio scenarios.',
      })
    if (
      new Set(setup.scenarioRevisionIds).size !== setup.scenarioRevisionIds.length ||
      setup.scenarioRevisionIds.some(
        (scenarioRevisionId, scenarioIndex) =>
          scenarioIndex && setup.scenarioRevisionIds[scenarioIndex - 1] >= scenarioRevisionId,
      )
    )
      context.addIssue({
        code: 'custom',
        path: ['graph', 'sharedSetup', index],
        message: 'Shared setup scenario IDs must be unique and sorted.',
      })
  }
}

function validateScenarioGraph(graph: ScenarioGraph, known: Set<string>, context: z.RefinementCtx) {
  validateGraphEdges(graph.edges, known, context)
  validateSharedSetups(graph.sharedSetup, known, context)
}

export const scenarioPortfolioSchema = z
  .object({
    schemaVersion: z.literal(qualityJourneyContractVersion),
    portfolioId: id,
    portfolioRevisionId: id,
    journeyId: id,
    targetProjectId: id,
    cycleId: id,
    discoveryRevisionId: id,
    discoveryCompletionHash: digest,
    predecessorPortfolioRevisionId: id.optional(),
    coverageRationale: text,
    graph: scenarioGraphSchema,
    scenarios: z.array(scenarioRevisionSchema).min(1).max(512),
  })
  .strict()
  .superRefine((portfolio, context) =>
    validateScenarioGraph(portfolio.graph, validateScenarioIds(portfolio.scenarios, context), context),
  )

export type ScenarioPortfolio = z.infer<typeof scenarioPortfolioSchema>

export function scenarioBehavioralIntentHash(value: z.infer<typeof scenarioRevisionSchema>['behavioralIntent']) {
  return hash(value)
}
export function scenarioEnrichmentHash(value: z.infer<typeof scenarioRevisionSchema>['enrichment']) {
  return hash(value)
}
export function scenarioLayoutHash(value: z.infer<typeof scenarioRevisionSchema>['layout']) {
  return hash(value)
}
export function hashScenarioPortfolio(value: ScenarioPortfolio) {
  return hash(value)
}
export function scenarioPortfolioReviewHash(portfolio: ScenarioPortfolio) {
  return hash({
    portfolioRevisionId: portfolio.portfolioRevisionId,
    portfolioHash: hashScenarioPortfolio(portfolio),
    scenarios: portfolio.scenarios.map(scenario => ({
      scenarioRevisionId: scenario.scenarioRevisionId,
      behavioralIntentHash: scenarioBehavioralIntentHash(scenario.behavioralIntent),
    })),
  })
}
function hash(value: unknown) {
  return `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`
}
