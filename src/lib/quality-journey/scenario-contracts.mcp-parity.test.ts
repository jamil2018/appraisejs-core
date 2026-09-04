import { describe, expect, it } from 'vitest'

import { scenarioPortfolioSchema as mcpScenarioPortfolioSchema } from '../../../packages/appraisejs/src/mcp/domains/quality-journey.js'
import { scenarioPortfolioSchema } from './scenario-contracts'

const digest = (character: string) => `sha256:${character.repeat(64)}`

function portfolio() {
  return {
    schemaVersion: 'appraise.quality-journey/v1',
    portfolioId: 'portfolio-1',
    portfolioRevisionId: 'portfolio-revision-1',
    journeyId: 'journey-1',
    targetProjectId: 'target-1',
    cycleId: 'cycle-1',
    discoveryRevisionId: 'discovery-1',
    discoveryCompletionHash: digest('a'),
    coverageRationale: 'The portfolio covers the approved checkout obligation and alternate payment branch.',
    graph: {
      edges: [
        {
          sourceScenarioRevisionId: 'scenario-revision-1',
          targetScenarioRevisionId: 'scenario-revision-2',
          relation: 'DEPENDS_ON',
          rationale: 'The alternate path requires the shopper setup.',
        },
      ],
      sharedSetup: [
        {
          setupId: 'setup-1',
          label: 'Authenticated shopper',
          scenarioRevisionIds: ['scenario-revision-1', 'scenario-revision-2'],
        },
      ],
    },
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
        enrichment: {
          observationIds: ['observation-1'],
          resourceAssumptionIds: ['resource-1'],
          feasibilityNotes: ['The checkout operation is available.'],
        },
        layout: { x: 20, y: 10, sequence: 0 },
      },
      {
        stableScenarioId: 'scenario-2',
        scenarioRevisionId: 'scenario-revision-2',
        behavioralIntent: {
          title: 'Alternate payment succeeds',
          narrative: 'A shopper completes checkout using an alternate payment method.',
          exploratoryRationale: 'Exercises a meaningful alternative payment branch.',
          expectedSignals: ['Order confirmation'],
          steps: [{ stepId: 'step-2', action: 'Submit alternate payment', expected: 'Confirmation is visible' }],
        },
        enrichment: {
          observationIds: ['observation-2'],
          resourceAssumptionIds: [],
          feasibilityNotes: [],
        },
        layout: { x: 40, y: 10, sequence: 1 },
      },
    ],
  }
}

const corpus: ReadonlyArray<{ name: string; accepted: boolean; value: () => unknown }> = [
  { name: 'canonical portfolio', accepted: true, value: portfolio },
  {
    name: 'identifier outside canonical character set',
    accepted: false,
    value: () => ({ ...portfolio(), targetProjectId: 'target project' }),
  },
  {
    name: 'unsorted requirement IDs',
    accepted: false,
    value: () => {
      const value = portfolio()
      value.scenarios[0].behavioralIntent.requirementIds = ['REQ-2', 'REQ-1']
      return value
    },
  },
  {
    name: 'missing traceability',
    accepted: false,
    value: () => {
      const value = portfolio()
      delete value.scenarios[1].behavioralIntent.exploratoryRationale
      return value
    },
  },
  {
    name: 'expected signals above the bounded maximum',
    accepted: false,
    value: () => {
      const value = portfolio()
      value.scenarios[0].behavioralIntent.expectedSignals = Array.from({ length: 65 }, (_, index) => `signal-${index}`)
      return value
    },
  },
  {
    name: 'steps above the bounded maximum',
    accepted: false,
    value: () => {
      const value = portfolio()
      value.scenarios[0].behavioralIntent.steps = Array.from({ length: 129 }, (_, index) => ({
        stepId: `step-${index}`,
        action: `Action ${index}`,
        expected: `Expected ${index}`,
      }))
      return value
    },
  },
  {
    name: 'unsorted observation IDs',
    accepted: false,
    value: () => {
      const value = portfolio()
      value.scenarios[0].enrichment.observationIds = ['observation-2', 'observation-1']
      return value
    },
  },
  {
    name: 'duplicate layout sequence',
    accepted: false,
    value: () => {
      const value = portfolio()
      value.scenarios[1].layout.sequence = 0
      return value
    },
  },
  {
    name: 'duplicate scenario revision ID',
    accepted: false,
    value: () => {
      const value = portfolio()
      value.scenarios[1].scenarioRevisionId = 'scenario-revision-1'
      return value
    },
  },
  {
    name: 'reversed edge order',
    accepted: false,
    value: () => {
      const value = portfolio()
      value.graph.edges = [
        {
          sourceScenarioRevisionId: 'scenario-revision-2',
          targetScenarioRevisionId: 'scenario-revision-1',
          relation: 'DEPENDS_ON',
          rationale: 'The reverse edge sorts later.',
        },
        ...value.graph.edges,
      ]
      return value
    },
  },
  {
    name: 'duplicate graph edge',
    accepted: false,
    value: () => {
      const value = portfolio()
      value.graph.edges.push({ ...value.graph.edges[0] })
      return value
    },
  },
  {
    name: 'self-referential graph edge',
    accepted: false,
    value: () => {
      const value = portfolio()
      value.graph.edges = [
        {
          ...value.graph.edges[0],
          targetScenarioRevisionId: 'scenario-revision-1',
        },
      ]
      return value
    },
  },
  {
    name: 'dangling shared-setup scenario reference',
    accepted: false,
    value: () => {
      const value = portfolio()
      value.graph.sharedSetup[0].scenarioRevisionIds = ['scenario-revision-1', 'foreign-scenario']
      return value
    },
  },
  {
    name: 'unsorted shared-setup members',
    accepted: false,
    value: () => {
      const value = portfolio()
      value.graph.sharedSetup[0].scenarioRevisionIds.reverse()
      return value
    },
  },
  {
    name: 'too many scenarios',
    accepted: false,
    value: () => {
      const value = portfolio()
      value.scenarios = Array.from({ length: 513 }, (_, index) => ({
        ...value.scenarios[0],
        stableScenarioId: `scenario-${String(index).padStart(3, '0')}`,
        scenarioRevisionId: `scenario-revision-${String(index).padStart(3, '0')}`,
        layout: { x: index, y: 0, sequence: index },
      }))
      value.graph = { edges: [], sharedSetup: [] }
      return value
    },
  },
]

describe('Scenario Portfolio MCP ingress parity', () => {
  it.each(corpus)('$name has the same canonical and MCP acceptance', ({ accepted, value }) => {
    const candidate = value()
    expect(scenarioPortfolioSchema.safeParse(candidate).success).toBe(accepted)
    expect(mcpScenarioPortfolioSchema.safeParse(candidate).success).toBe(accepted)
  })
})
