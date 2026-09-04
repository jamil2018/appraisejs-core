import { describe, expect, it } from 'vitest'
import { scenarioPortfolioSchema } from './scenario-contracts'

const digest = (character: string) => `sha256:${character.repeat(64)}`
const portfolio = {
  schemaVersion: 'appraise.quality-journey/v1',
  portfolioId: 'portfolio-1',
  portfolioRevisionId: 'portfolio-revision-1',
  journeyId: 'journey-1',
  targetProjectId: 'target-1',
  cycleId: 'cycle-1',
  discoveryRevisionId: 'discovery-1',
  discoveryCompletionHash: digest('a'),
  coverageRationale: 'The portfolio covers the approved checkout obligation and its alternate payment branch.',
  graph: { edges: [], sharedSetup: [] },
  scenarios: [
    {
      stableScenarioId: 'scenario-1',
      scenarioRevisionId: 'scenario-revision-1',
      behavioralIntent: {
        title: 'Checkout succeeds',
        narrative: 'A shopper completes checkout.',
        requirementIds: ['REQ-1'],
        expectedSignals: ['Order confirmation'],
        steps: [{ stepId: 'step-1', action: 'Submit checkout', expected: 'Confirmation is visible' }],
      },
      enrichment: { observationIds: ['observation-1'], resourceAssumptionIds: ['resource-1'], feasibilityNotes: [] },
      layout: { x: 20, y: 10, sequence: 0 },
    },
  ],
}

describe('scenario portfolio contract', () => {
  it('keeps behavioral intent, enrichment, layout, and completed discovery provenance explicit', () => {
    expect(scenarioPortfolioSchema.parse(portfolio)).toMatchObject({ portfolioRevisionId: 'portfolio-revision-1' })
  })
  it('requires requirement traceability or explicit exploratory rationale', () => {
    const intentWithoutTraceability = Object.fromEntries(
      Object.entries(portfolio.scenarios[0].behavioralIntent).filter(([key]) => key !== 'requirementIds'),
    )
    const invalid = {
      ...portfolio,
      scenarios: [{ ...portfolio.scenarios[0], behavioralIntent: intentWithoutTraceability }],
    }
    expect(() => scenarioPortfolioSchema.parse(invalid)).toThrow('traceability')
  })
  it('rejects unsorted stable scenario IDs', () => {
    const invalid = structuredClone(portfolio)
    invalid.scenarios.push({
      ...invalid.scenarios[0],
      stableScenarioId: 'scenario-0',
      scenarioRevisionId: 'scenario-revision-2',
    })
    expect(() => scenarioPortfolioSchema.parse(invalid)).toThrow('Stable scenario IDs')
  })
  it('requires graph references to remain inside the exact portfolio', () => {
    const invalid = {
      ...structuredClone(portfolio),
      graph: {
        ...portfolio.graph,
        edges: [
          {
            sourceScenarioRevisionId: 'scenario-revision-1',
            targetScenarioRevisionId: 'foreign-scenario',
            relation: 'DEPENDS_ON',
            rationale: 'Invalid foreign dependency.',
          },
        ],
      },
    }
    expect(() => scenarioPortfolioSchema.parse(invalid)).toThrow('Graph edges')
  })
  it('requires unique layout sequences and canonical graph identities', () => {
    const invalid = structuredClone(portfolio)
    invalid.scenarios.push({
      ...invalid.scenarios[0],
      stableScenarioId: 'scenario-2',
      scenarioRevisionId: 'scenario-revision-2',
    })
    ;(invalid as { graph: { edges: unknown[]; sharedSetup: unknown[] } }).graph = {
      edges: [
        {
          sourceScenarioRevisionId: 'scenario-revision-1',
          targetScenarioRevisionId: 'scenario-revision-2',
          relation: 'DEPENDS_ON',
          rationale: 'The second scenario requires checkout setup.',
        },
        {
          sourceScenarioRevisionId: 'scenario-revision-1',
          targetScenarioRevisionId: 'scenario-revision-2',
          relation: 'DEPENDS_ON',
          rationale: 'Duplicate relation.',
        },
      ],
      sharedSetup: [
        {
          setupId: 'setup-z',
          label: 'Shared account',
          scenarioRevisionIds: ['scenario-revision-1', 'scenario-revision-2'],
        },
        {
          setupId: 'setup-a',
          label: 'Shared browser',
          scenarioRevisionIds: ['scenario-revision-2', 'scenario-revision-1'],
        },
      ],
    }
    expect(() => scenarioPortfolioSchema.parse(invalid)).toThrow('layout sequences')
    expect(() => scenarioPortfolioSchema.parse(invalid)).toThrow('duplicate a dependency')
    expect(() => scenarioPortfolioSchema.parse(invalid)).toThrow('Shared setup IDs')
  })
  it('rejects reversed graph edges so portfolio hashes are deterministic', () => {
    const invalid = structuredClone(portfolio) as {
      scenarios: Array<(typeof portfolio.scenarios)[number]>
      graph: { edges: unknown[]; sharedSetup: unknown[] }
    }
    invalid.scenarios.push({
      ...invalid.scenarios[0],
      stableScenarioId: 'scenario-2',
      scenarioRevisionId: 'scenario-revision-2',
      layout: { x: 30, y: 10, sequence: 1 },
    })
    invalid.graph.edges = [
      {
        sourceScenarioRevisionId: 'scenario-revision-2',
        targetScenarioRevisionId: 'scenario-revision-1',
        relation: 'DEPENDS_ON',
        rationale: 'Later edge first.',
      },
      {
        sourceScenarioRevisionId: 'scenario-revision-1',
        targetScenarioRevisionId: 'scenario-revision-2',
        relation: 'DEPENDS_ON',
        rationale: 'Earlier edge second.',
      },
    ]
    expect(() => scenarioPortfolioSchema.parse(invalid)).toThrow('deterministic')
  })
})
