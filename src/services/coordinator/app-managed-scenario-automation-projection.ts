import { z } from 'zod'
import { scenarioPortfolioSchema, automationScenarioMaterializationSchema } from '@/lib/quality-journey'
import { hashCanonical } from '@/lib/quality-journey/analysis-contracts'
import {
  preservesOrderedScenarioSteps,
  operatorLocatorRequirementId,
  validateAutomationLocatorSemantics,
} from '@/lib/quality-journey/automation-contracts'
import { ServiceError } from '@/services/shared/errors'
import {
  stepDefinitionSchema,
  validateStepInvocationInputs,
} from '../../../packages/cucumber-runtime/src/step-definitions/contracts'
import type { readInternalScenarioDesignerAssignment } from './quality-journey-scenario-service'
import type { readInternalAutomatorAssignment } from './quality-journey-automation-service'
import {
  appManagedScenarioAutomationOutputSchema,
  type AppManagedScenarioAutomationRole,
} from './app-managed-scenario-automation-contract'

type DesignerContext = Awaited<ReturnType<typeof readInternalScenarioDesignerAssignment>> & {
  portfolioRevisionId: string
}
type AutomatorContext = Awaited<ReturnType<typeof readInternalAutomatorAssignment>>
function deny(message: string): never {
  throw new ServiceError(message, 'CONFLICT')
}
const sorted = (values: string[]) => [...new Set(values)].sort()
const generatedId = (kind: string, ...parts: unknown[]) => `${kind}:${hashCanonical(parts).slice(7)}`
function decodeValue(value: unknown): unknown {
  if (value && typeof value === 'object' && 'json' in value) {
    try {
      return JSON.parse((value as { json: string }).json)
    } catch {
      deny('Automation encoded JSON value is invalid.')
    }
  }
  return value
}

export function appManagedPreparationProjection(role: AppManagedScenarioAutomationRole, value: unknown) {
  const designer = value as DesignerContext
  const automator = value as AutomatorContext
  const requirementIds =
    role === 'TEST_SCENARIO_DESIGNER'
      ? designer.analysisCharter.requirements.map((row: { requirementId: string }) => row.requirementId)
      : []
  const observationIds =
    role === 'TEST_SCENARIO_DESIGNER' ? designer.targetObservation.observations.map(row => row.observationId) : []
  const resourceIds =
    role === 'TEST_SCENARIO_DESIGNER'
      ? sorted(
          [
            designer.resourceResolution.reusable,
            designer.resourceResolution.incompatible,
            designer.resourceResolution.stale,
            designer.resourceResolution.crossTarget,
          ]
            .flat()
            .map(row => row.resourceId),
        )
      : []
  const bindings =
    role === 'AUTOMATOR'
      ? automator.stepDefinitions
          .flatMap(row => {
            const definition = stepDefinitionSchema.parse(row.definition)
            if (definition.execution.kind !== 'operation') return []
            const execution = definition.execution
            return automator.operations
              .filter(
                operation =>
                  operation.handler.id === execution.handlerId &&
                  operation.handler.version === execution.handlerVersion,
              )
              .map(operation => ({
                bindingId: '',
                definition,
                operationInputs: operation.inputs,
                stepDefinition: {
                  id: definition.identity.id,
                  version: definition.identity.version,
                  definitionHash: row.definitionHash,
                },
                operation: { id: operation.id, version: operation.version, handler: operation.handler },
                title: definition.intent.title,
                guidance: definition.agent.usageGuidance,
                inputs: definition.inputs,
                keywordCompatibility: definition.human.keywordCompatibility,
              }))
          })
          .sort(
            (a, b) =>
              JSON.stringify(a.stepDefinition).localeCompare(JSON.stringify(b.stepDefinition)) ||
              a.operation.id.localeCompare(b.operation.id),
          )
          .map((binding, index) => ({ ...binding, bindingId: `binding-${index + 1}` }))
      : []
  const sourceScenarios =
    role === 'AUTOMATOR'
      ? automator.scenarios.map((scenario, index) => ({ scenarioKey: `scenario-${index + 1}`, scenario }))
      : []
  const choices =
    role === 'TEST_SCENARIO_DESIGNER'
      ? {
          requirementIds,
          observationIds,
          resourceAssumptionIds: resourceIds,
          scenarioKeys:
            'Choose unique short local keys; graph edges and shared setup refer to those keys. Appraise generates all artifact and step IDs.',
        }
      : {
          bindings: bindings.map(binding => ({
            bindingId: binding.bindingId,
            operationId: binding.operation.id,
            title: binding.title,
            guidance: binding.guidance,
            inputs: binding.inputs.map(input => ({
              ...input,
              channel: input.type === 'locator' ? 'locatorRequirements' : 'parameters',
              required:
                input.required ||
                Boolean(binding.operationInputs.find(operationInput => operationInput.name === input.name)?.required),
            })),
            keywordCompatibility: binding.keywordCompatibility,
          })),
          scenarios: sourceScenarios.map(({ scenarioKey, scenario }) => ({
            scenarioKey,
            behavioralIntent: {
              ...scenario.behavioralIntent,
              steps: scenario.behavioralIntent.steps.map((step, sourceStepIndex) => ({
                sourceStepIndex,
                action: step.action,
                expected: step.expected,
              })),
            },
          })),
          locatorIds: automator.resourceBindings
            .filter(resource => resource.id.startsWith('locator:'))
            .map(resource => resource.id.slice('locator:'.length)),
        }

  function compile(output: z.infer<typeof appManagedScenarioAutomationOutputSchema>, submissionIdempotencyKey: string) {
    if (output.arguments.idempotencyKey !== submissionIdempotencyKey)
      deny('Preparation output changed its fixed submission identity.')
    if (role === 'TEST_SCENARIO_DESIGNER') {
      if (output.toolName !== 'quality_journey_scenarios_submit') deny('Preparation output changed its assigned role.')
      const model = output.arguments.portfolio
      const byKey = new Map(model.scenarios.map(scenario => [scenario.scenarioKey, scenario]))
      if (byKey.size !== model.scenarios.length) deny('Scenario keys must be unique.')
      const revisionId = (key: string) => {
        if (!byKey.has(key)) deny('Scenario graph refers to an unknown scenario key.')
        return generatedId('scenario-revision', designer.portfolioRevisionId, key)
      }
      const scenarios = model.scenarios
        .map((scenario, index) => {
          if (scenario.behavioralIntent.requirementIds?.some(id => !requirementIds.includes(id)))
            deny('Scenario requirement is outside the approved Analysis.')
          if (scenario.enrichment.observationIds.some(id => !observationIds.includes(id)))
            deny('Scenario observation is outside completed Discovery.')
          if (scenario.enrichment.resourceAssumptionIds.some(id => !resourceIds.includes(id)))
            deny('Scenario resource assumption is outside completed Discovery.')
          return {
            stableScenarioId: generatedId('scenario', designer.portfolioId, scenario.scenarioKey),
            scenarioRevisionId: revisionId(scenario.scenarioKey),
            behavioralIntent: {
              ...scenario.behavioralIntent,
              ...(scenario.behavioralIntent.requirementIds
                ? { requirementIds: sorted(scenario.behavioralIntent.requirementIds) }
                : {}),
              steps: scenario.behavioralIntent.steps.map((step, stepIndex) => ({
                ...step,
                stepId: generatedId('scenario-step', designer.portfolioId, scenario.scenarioKey, stepIndex),
              })),
            },
            enrichment: {
              ...scenario.enrichment,
              observationIds: sorted(scenario.enrichment.observationIds),
              resourceAssumptionIds: sorted(scenario.enrichment.resourceAssumptionIds),
            },
            layout: { x: index * 320, y: 0, sequence: index },
          }
        })
        .sort((a, b) => a.stableScenarioId.localeCompare(b.stableScenarioId))
      const edges = model.graph.edges
        .map(({ sourceScenarioKey, targetScenarioKey, ...edge }) => ({
          ...edge,
          sourceScenarioRevisionId: revisionId(sourceScenarioKey),
          targetScenarioRevisionId: revisionId(targetScenarioKey),
        }))
        .sort((a, b) =>
          `${a.sourceScenarioRevisionId}\0${a.targetScenarioRevisionId}\0${a.relation}`.localeCompare(
            `${b.sourceScenarioRevisionId}\0${b.targetScenarioRevisionId}\0${b.relation}`,
          ),
        )
      const portfolio = scenarioPortfolioSchema.parse({
        schemaVersion: 'appraise.quality-journey/v1',
        journeyId: 'projection',
        targetProjectId: 'projection',
        portfolioId: designer.portfolioId,
        portfolioRevisionId: designer.portfolioRevisionId,
        cycleId: designer.cycleId,
        discoveryRevisionId: designer.discoveryRevisionId,
        discoveryCompletionHash: designer.discoveryCompletionHash,
        ...(designer.revisionContext
          ? { predecessorPortfolioRevisionId: designer.revisionContext.portfolio.portfolioRevisionId }
          : {}),
        coverageRationale: model.coverageRationale,
        scenarios,
        graph: {
          edges,
          sharedSetup: model.graph.sharedSetup
            .map(setup => ({
              setupId: generatedId('scenario-setup', designer.portfolioId, setup.setupKey),
              label: setup.label,
              scenarioRevisionIds: sorted(setup.scenarioKeys.map(revisionId)),
            }))
            .sort((a, b) => a.setupId.localeCompare(b.setupId)),
        },
      })
      const publicPortfolio = Object.fromEntries(
        Object.entries(portfolio).filter(([key]) => !['journeyId', 'targetProjectId'].includes(key)),
      )
      return {
        toolName: output.toolName,
        arguments: { idempotencyKey: submissionIdempotencyKey, portfolio: publicPortfolio },
      }
    }
    if (output.toolName !== 'quality_journey_automation_materialize')
      deny('Preparation output changed its assigned role.')
    if (
      new Set(output.arguments.scenarios.map(row => row.scenarioKey)).size !== automator.scenarios.length ||
      output.arguments.scenarios.length !== automator.scenarios.length
    )
      deny('Automation must cover every approved scenario exactly once.')
    const scenarios = output.arguments.scenarios.map(proposal => {
      const source = sourceScenarios.find(row => row.scenarioKey === proposal.scenarioKey)?.scenario
      const sourceIndexes = proposal.steps.map((step, index) => step.sourceStepIndex ?? index)
      if (
        !source ||
        !preservesOrderedScenarioSteps(
          source.behavioralIntent.steps.map((_, index) => String(index)),
          sourceIndexes.map(String),
        ) ||
        (proposal.steps.some(step => step.sourceStepIndex !== undefined) &&
          proposal.steps.some(step => step.sourceStepIndex === undefined))
      )
        deny('Automation changed the approved scenario steps.')
      return automationScenarioMaterializationSchema.parse({
        scenarioRevisionId: source.scenarioRevisionId,
        steps: proposal.steps.map(({ bindingId, sourceStepIndex, ...step }, index) => {
          const sourceIndex = sourceStepIndex ?? index
          const binding = bindings.find(row => row.bindingId === bindingId)
          if (!binding) deny('Automation selected a binding outside the frozen resources.')
          const parameters = step.parameters.map(parameter => ({ ...parameter, value: decodeValue(parameter.value) }))
          // Native output may use the input's declared locator type in the flat parameter channel.
          // Project that representation only when it binds an exact frozen canonical locator input and ID.
          const locatorParameters = parameters.filter(parameter => parameter.type === 'locator')
          for (const parameter of locatorParameters) {
            if (
              !binding.operationInputs.some(input => input.name === parameter.name && input.type === 'locator') ||
              typeof parameter.value !== 'string' ||
              !automator.resourceBindings.some(resource => resource.id === `locator:${parameter.value}`)
            )
              deny('Automation selected a locator outside the frozen resources or canonical operation.')
          }
          const projectedStep = {
            ...step,
            parameters: parameters.filter(parameter => parameter.type !== 'locator'),
            testData: step.testData.map(parameter => ({ ...parameter, value: decodeValue(parameter.value) })),
            locatorRequirements: [
              ...step.locatorRequirements.map(locator =>
                locator.reviewedSelector
                  ? {
                      ...locator,
                      requirementId: operatorLocatorRequirementId(source.scenarioRevisionId, locator.reviewedSelector),
                    }
                  : locator,
              ),
              ...locatorParameters.map(parameter => ({
                requirementId: generatedId(
                  'locator-requirement',
                  source.scenarioRevisionId,
                  index,
                  parameter.name,
                  parameter.value,
                ),
                parameterName: parameter.name,
                locatorId: parameter.value as string,
              })),
            ],
          }
          try {
            validateAutomationLocatorSemantics(binding.operation.id, projectedStep.locatorRequirements)
          } catch (error) {
            deny(error instanceof Error ? error.message : 'Automation locator semantics are invalid.')
          }
          const entries = [
            ...projectedStep.parameters.map(parameter => ({
              name: parameter.name,
              type: parameter.type,
              value: parameter.value,
              locator: false,
            })),
            ...projectedStep.testData.map(parameter => ({
              name: parameter.key,
              type: parameter.type,
              value: parameter.value,
              locator: false,
            })),
            ...projectedStep.locatorRequirements.map(parameter => ({
              name: parameter.parameterName,
              type: 'locator',
              value: parameter.locatorId ?? parameter.requirementId,
              locator: true,
            })),
          ]
          const names = entries.map(entry => entry.name)
          if (
            new Set(names).size !== names.length ||
            entries.some(
              entry =>
                !binding.operationInputs.some(
                  input =>
                    input.name === entry.name &&
                    input.type === entry.type &&
                    (input.type === 'locator') === entry.locator,
                ),
            ) ||
            binding.operationInputs.some(input => input.required && !names.includes(input.name))
          )
            deny('Automation inputs do not match the selected canonical operation.')
          if (
            projectedStep.locatorRequirements.some(
              locator =>
                locator.locatorId &&
                !automator.resourceBindings.some(resource => resource.id === `locator:${locator.locatorId}`),
            )
          )
            deny('Automation selected a locator outside the frozen resources.')
          try {
            validateStepInvocationInputs(
              binding.definition,
              Object.fromEntries(entries.map(entry => [entry.name, entry.value])),
            )
          } catch {
            deny('Automation input values do not match the selected Step Definition.')
          }
          return {
            ...projectedStep,
            sourceScenarioStepId: source.behavioralIntent.steps[sourceIndex]!.stepId,
            stepDefinition: binding.stepDefinition,
            operation: binding.operation,
          }
        }),
      })
    })
    return { toolName: output.toolName, arguments: { idempotencyKey: submissionIdempotencyKey, scenarios } }
  }
  return { choices, compile }
}
