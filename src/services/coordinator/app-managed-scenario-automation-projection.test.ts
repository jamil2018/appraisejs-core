import { describe, expect, it } from 'vitest'
import { appManagedPreparationProjection } from './app-managed-scenario-automation-projection'
import { appManagedScenarioAutomationOutputSchema } from './app-managed-scenario-automation-contract'
import { builtInStepDefinitions } from '../../../packages/cucumber-runtime/src/step-definitions'
import { defaultOperationDefinitions } from '@/lib/operation-catalog'

const context = {
  cycleId: 'cycle-issued',
  portfolioId: 'portfolio-issued',
  portfolioRevisionId: 'revision-issued',
  discoveryRevisionId: 'discovery-issued',
  discoveryCompletionHash: `sha256:${'a'.repeat(64)}`,
  analysisCharter: { requirements: [{ requirementId: 'REQ-A' }, { requirementId: 'REQ-B' }] },
  targetObservation: { observations: [{ observationId: 'OBS-A' }, { observationId: 'OBS-B' }] },
  resourceResolution: { reusable: [{ resourceId: 'module:real' }], incompatible: [], stale: [], crossTarget: [] },
  revisionContext: null,
}
function candidate() {
  return appManagedScenarioAutomationOutputSchema.parse({
    toolName: 'quality_journey_scenarios_submit',
    arguments: {
      idempotencyKey: 'fixed-key',
      portfolio: {
        coverageRationale: 'Check two observed behaviors.',
        graph: { edges: [], sharedSetup: [] },
        scenarios: [
          {
            scenarioKey: 'checkout',
            behavioralIntent: {
              title: 'Checkout',
              narrative: 'Open checkout.',
              requirementIds: ['REQ-B', 'REQ-A'],
              expectedSignals: ['Checkout appears.'],
              steps: [{ action: 'Then checkout is displayed', expected: 'Checkout' }],
            },
            enrichment: {
              observationIds: ['OBS-B', 'OBS-A'],
              resourceAssumptionIds: ['module:real'],
              feasibilityNotes: [],
            },
          },
        ],
      },
    },
  })
}

describe('managed preparation projection', () => {
  function automator(operationId = 'browser.text.assertion.assert.element.equals.text') {
    const operation = defaultOperationDefinitions.find(row => row.id === operationId)!
    const definition = builtInStepDefinitions.find(
      row => row.execution.kind === 'operation' && row.execution.handlerId === operation.handler.id,
    )!
    return appManagedPreparationProjection('AUTOMATOR', {
      stepDefinitions: [{ definition, definitionHash: `sha256:${'b'.repeat(64)}` }],
      operations: [operation],
      scenarios: [
        {
          scenarioRevisionId: 'scenario-issued',
          behavioralIntent: {
            steps: [{ stepId: 'step-issued', action: 'Verify confirmation', expected: 'Order confirmed' }],
          },
        },
      ],
      resourceBindings: [{ id: 'locator:confirmation' }],
    })
  }
  function automation() {
    return appManagedScenarioAutomationOutputSchema.parse({
      toolName: 'quality_journey_automation_materialize',
      arguments: {
        idempotencyKey: 'fixed-key',
        scenarios: [
          {
            scenarioKey: 'scenario-1',
            steps: [
              {
                bindingId: 'binding-1',
                parameters: [
                  { name: 'elementName', type: 'locator', value: 'confirmation' },
                  { name: 'shouldEqual', type: 'boolean', value: true },
                  { name: 'elementText', type: 'string', value: 'Order confirmed' },
                ],
                testData: [],
                locatorRequirements: [],
              },
            ],
          },
        ],
      },
    })
  }
  it('projects frozen locator-typed inputs into canonical locator requirements without changing retained output', () => {
    const output = automation()
    const original = JSON.stringify(output)
    const projection = automator()
    const compiled = projection.compile(output, 'fixed-key')
    expect(compiled.arguments).toMatchObject({
      scenarios: [
        {
          scenarioRevisionId: 'scenario-issued',
          steps: [
            {
              sourceScenarioStepId: 'step-issued',
              parameters: [{ name: 'shouldEqual' }, { name: 'elementText' }],
              locatorRequirements: [
                {
                  parameterName: 'elementName',
                  locatorId: 'confirmation',
                  requirementId: expect.stringMatching(/^locator-requirement:/),
                },
              ],
            },
          ],
        },
      ],
    })
    expect(JSON.stringify(output)).toBe(original)
    expect(projection.compile(output, 'fixed-key')).toEqual(compiled)
    expect(projection.choices.bindings?.[0].inputs[0]).toMatchObject({ channel: 'locatorRequirements' })
  })
  it('rejects an invented locator and duplicate locator channels before canonical submission', () => {
    const output = automation()
    if (output.toolName !== 'quality_journey_automation_materialize') throw new Error('Invalid fixture')
    output.arguments.scenarios[0].steps[0].parameters[0].value = 'another-target'
    expect(() => automator().compile(output, 'fixed-key')).toThrow('outside the frozen resources')
    output.arguments.scenarios[0].steps[0].parameters[0].value = 'confirmation'
    output.arguments.scenarios[0].steps[0].locatorRequirements = [
      { requirementId: 'duplicate', parameterName: 'elementName', locatorId: 'confirmation' },
    ]
    expect(() => automator().compile(output, 'fixed-key')).toThrow('inputs do not match')
  })
  it('expands a compound source action into ordered operations while preserving its exact source ID', () => {
    const output = automation()
    if (output.toolName !== 'quality_journey_automation_materialize') throw new Error('Invalid fixture')
    const step = output.arguments.scenarios[0].steps[0]
    output.arguments.scenarios[0].steps = [
      { ...step, sourceStepIndex: 0 },
      { ...step, sourceStepIndex: 0 },
    ]
    const compiled = automator().compile(output, 'fixed-key')
    expect(compiled.arguments).toMatchObject({
      scenarios: [{ steps: [{ sourceScenarioStepId: 'step-issued' }, { sourceScenarioStepId: 'step-issued' }] }],
    })
    delete output.arguments.scenarios[0].steps[1].sourceStepIndex
    expect(() => automator().compile(output, 'fixed-key')).toThrow('approved scenario steps')
  })
  it('rejects interactive supplemental selectors and unresolved runtime locators before a claim', () => {
    const output = automation()
    if (output.toolName !== 'quality_journey_automation_materialize') throw new Error('Invalid fixture')
    const step = output.arguments.scenarios[0].steps[0]
    step.parameters = []
    step.locatorRequirements = [
      {
        requirementId: 'injected',
        parameterName: 'target',
        runtimeParameter: true,
        reviewedSelector: { selector: 'css=main > p', reason: 'Operator observation of the fixture paragraph.' },
      },
    ]
    expect(() => automator('browser.mouse.click').compile(output, 'fixed-key')).toThrow('noninteractive observation')
    expect(() => automator('browser.assertions.visible').compile(output, 'fixed-key')).not.toThrow()
    delete step.locatorRequirements[0].reviewedSelector
    expect(() => automator('browser.assertions.visible').compile(output, 'fixed-key')).toThrow(
      'exact reviewed supplemental selector or frozen locator',
    )
  })
  it('injects immutable identities and canonicalizes reference order without asking the model for hashes', () => {
    const projection = appManagedPreparationProjection('TEST_SCENARIO_DESIGNER', context)
    const compiled = projection.compile(candidate(), 'fixed-key')
    expect(compiled).toEqual(projection.compile(candidate(), 'fixed-key'))
    expect(compiled.arguments).toMatchObject({
      portfolio: {
        portfolioId: 'portfolio-issued',
        portfolioRevisionId: 'revision-issued',
        cycleId: 'cycle-issued',
        discoveryRevisionId: 'discovery-issued',
        discoveryCompletionHash: context.discoveryCompletionHash,
        scenarios: [
          {
            stableScenarioId: expect.stringMatching(/^scenario:/),
            scenarioRevisionId: expect.stringMatching(/^scenario-revision:/),
            behavioralIntent: {
              requirementIds: ['REQ-A', 'REQ-B'],
              steps: [{ stepId: expect.stringMatching(/^scenario-step:/) }],
            },
            enrichment: { observationIds: ['OBS-A', 'OBS-B'] },
          },
        ],
      },
    })
    expect(compiled.arguments).not.toHaveProperty('journeyId')
  })
  it('rejects invented evidence and changed submission identity before canonical submission', () => {
    const projection = appManagedPreparationProjection('TEST_SCENARIO_DESIGNER', context)
    const call = candidate()
    if (call.toolName !== 'quality_journey_scenarios_submit') throw new Error('Invalid test fixture')
    call.arguments.portfolio.scenarios[0].enrichment.observationIds = ['invented']
    expect(() => projection.compile(call, 'fixed-key')).toThrow('outside completed Discovery')
    expect(() => projection.compile(candidate(), 'changed-key')).toThrow('fixed submission identity')
  })
  it('rejects model-supplied immutable metadata rather than silently treating it as authority', () => {
    const call = candidate()
    if (call.toolName !== 'quality_journey_scenarios_submit') throw new Error('Invalid test fixture')
    expect(() =>
      appManagedScenarioAutomationOutputSchema.parse({
        ...call,
        arguments: {
          ...call.arguments,
          portfolio: { ...call.arguments.portfolio, discoveryCompletionHash: context.discoveryCompletionHash },
        },
      }),
    ).toThrow()
  })
})
