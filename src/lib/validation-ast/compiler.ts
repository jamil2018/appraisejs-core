import type { OperationDescriptor } from '../../../packages/cucumber-runtime/src/operations/contracts.ts'
import type { LocatorDescriptor, LocatorGraph } from '@/lib/locator-graph'

import {
  compileCustomExtension,
  CustomExtensionCompilationError,
  type CompiledCustomExtension,
} from './custom-extension-compiler'
import type { CustomExtensionPolicy } from './extension-policy'
import { validationAstSubmissionSchema, type CustomActionExtensionProposal, type ValidationAst } from './schemas'
import {
  computeStepReferenceHash,
  type StepDefinition,
  type StepInvocation,
} from '../../../packages/cucumber-runtime/src/step-definitions/contracts.ts'
import { validateStepDefinitionComposition } from '../../../packages/cucumber-runtime/src/step-definitions/composition-validator.ts'

export const VALIDATION_AST_PREVIEW_MAX_STEPS = 100

type ValidationOperationSemantic = Pick<
  OperationDescriptor,
  'id' | 'version' | 'categories' | 'capabilities' | 'runtime' | 'inputs' | 'outputs' | 'deprecated' | 'assertionConcerns' | 'descriptorHash'
>
type OperationRegistryReader = {
  manifestHash: string
  read(refs: Array<{ id: string; version?: string }>): ValidationOperationSemantic[]
}

export type ValidationAstCompilerContext = {
  project: { id: string; fingerprint: string }
  planScope: string
  currentPlanHash: string
  planTaskIds: string[]
  operationRegistry: OperationRegistryReader
  stepDefinitions: Map<string, { definition: StepDefinition; definitionHash: string; receiptHash: string }>
  locatorGraph: LocatorGraph
  environments: Record<string, { keys: string[]; types?: Record<string, string> }>
  availableRuntimes: Array<ValidationOperationSemantic['runtime']>
  availableCapabilities: string[]
  extensionPolicy: CustomExtensionPolicy
}

export type ValidationAstIssue = {
  code: string
  message: string
  scenarioId?: string
  stepId?: string
  referenceId?: string
}

export { validationAstEntityIds, validationAstHash, validationAstStepId } from './projection-identifiers'
import { validationAstHash } from './projection-identifiers'
import { createValidationAstCanonicalProjection, locatorBindingsForAst } from './canonical-projection'
import { checkValidationAstAuthoringProfile } from './authoring-profile'
import { validationAstExtensionReferences } from './extension-references'
const hash = validationAstHash

function stepDescription(step: ValidationAst['scenarios'][number]['steps'][number]) {
  return step.invocation.presentation?.description ?? step.id
}

function scalarType(value: unknown) {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return typeof value
  if (value && typeof value === 'object' && 'ref' in value) return String((value as { ref: unknown }).ref)
  return 'unknown'
}

function issue(code: string, message: string, location: Partial<ValidationAstIssue> = {}): ValidationAstIssue {
  return { code, message, ...location }
}

function resolveOperation(
  registry: OperationRegistryReader,
  id: string,
  version: string,
  location: Partial<ValidationAstIssue>,
  blockers: ValidationAstIssue[],
) {
  try {
    return registry.read([{ id, version }])[0]!
  } catch {
    blockers.push(
      issue('operation-handler-not-found', `Trusted operation handler ${id}@${version} was not found.`, { ...location, referenceId: id }),
    )
    return undefined
  }
}

function validateDefinitionInputs(
  definition: StepDefinition,
  inputs: Record<string, unknown>,
  location: Partial<ValidationAstIssue>,
  state: ReferenceValidationState,
) {
  const definitions = new Map(definition.inputs.map(input => [input.name, input]))
  for (const definitionInput of definition.inputs) {
    if (
      definitionInput.required &&
      inputs[definitionInput.name] === undefined &&
      definitionInput.defaultValue === undefined
    )
      state.blockers.push(
        issue('required-step-input-missing', `Required input ${definitionInput.name} is missing.`, location),
      )
  }
  for (const [name, value] of Object.entries(inputs)) {
    const definitionInput = definitions.get(name)
    if (!definitionInput) {
      state.blockers.push(
        issue('unknown-step-input', `Input ${name} is not declared by ${definition.identity.id}.`, location),
      )
      continue
    }
    const actual = resolveActionInputType(value, state)
    if (isIncompatibleActionInputType(actual, definitionInput.type))
      state.blockers.push(
        issue(
          'step-input-type-mismatch',
          `Input ${name} requires ${definitionInput.type}, received ${actual}.`,
          location,
        ),
      )
  }
}

function resolveActionInputType(value: unknown, state: ReferenceValidationState) {
  const type = scalarType(value)
  if (!value || typeof value !== 'object') return type
  if (type === 'stored' && 'name' in value) return state.stored.get(String(value.name))
  if (type === 'environment' && 'key' in value) {
    const key = String(value.key)
    const resolvedTypes = new Set(
      state.ast.matrix.map(item => {
        const descriptor = state.context.environments[item.environmentId]
        return descriptor?.types?.[key] ?? (key === 'baseUrl' || key === 'base-url' ? 'string' : undefined)
      }),
    )
    return resolvedTypes.size === 1 ? [...resolvedTypes][0] : undefined
  }
  return type
}

function isIncompatibleActionInputType(actual: string | undefined, expected: string) {
  return Boolean(actual && actual !== expected && actual !== 'custom-extension')
}

function validateLocator(
  locator: LocatorDescriptor,
  operation: ValidationOperationSemantic,
  context: ValidationAstCompilerContext,
  location: Partial<ValidationAstIssue>,
  blockers: ValidationAstIssue[],
) {
  if (
    locator.compatibleActionCategories.length &&
    !operation.categories.some(category => locator.compatibleActionCategories.includes(category))
  )
    blockers.push(
      issue('locator-operation-incompatible', `Locator ${locator.id} is not compatible with operation ${operation.id}.`, {
        ...location,
        referenceId: locator.id,
      }),
    )
  if (locator.scope.availableStates.length)
    blockers.push(
      issue('locator-state-unresolved', `Locator ${locator.id} requires an explicit available state.`, {
        ...location,
        referenceId: locator.id,
      }),
    )
  if (!context.locatorGraph.nodes.some(node => node.id === locator.scope.surfaceId))
    blockers.push(
      issue('locator-surface-not-found', `Locator ${locator.id} references an unavailable surface.`, location),
    )
}

type ReferenceValidationState = {
  ast: ValidationAst
  context: ValidationAstCompilerContext
  blockers: ValidationAstIssue[]
  warnings: ValidationAstIssue[]
  operations: Map<string, ValidationOperationSemantic>
  usedLocators: Map<string, LocatorDescriptor>
  locators: Map<string, LocatorDescriptor>
  extensions: Map<string, CustomActionExtensionProposal>
  stored: Map<string, string>
}

type AstReference = { ref: string; id?: string; version?: string; name?: string; key?: string }

function validateReference(
  reference: AstReference,
  operation: ValidationOperationSemantic | undefined,
  location: Partial<ValidationAstIssue>,
  state: ReferenceValidationState,
) {
  if (reference.ref === 'locator') validateLocatorReference(reference, operation, location, state)
  if (reference.ref === 'stored' && reference.name && !state.stored.has(reference.name))
    state.blockers.push(
      issue('stored-value-unavailable', `Stored value ${reference.name} is not available before this step.`, location),
    )
  if (reference.ref === 'environment' && reference.key) validateEnvironmentReference(reference.key, location, state)
  if (reference.ref === 'custom-extension') validateExtensionReference(reference, location, state)
}

function validateLocatorReference(
  reference: AstReference,
  operation: ValidationOperationSemantic | undefined,
  location: Partial<ValidationAstIssue>,
  state: ReferenceValidationState,
) {
  const locator = state.locators.get(`${reference.id}@${reference.version}`)
  if (!locator) {
    state.blockers.push(
      issue('locator-reference-not-found', `Locator ${reference.id}@${reference.version} was not found.`, {
        ...location,
        referenceId: reference.id,
      }),
    )
    return
  }
  state.usedLocators.set(`${locator.id}@${locator.version}`, locator)
  if (operation) validateLocator(locator, operation, state.context, location, state.blockers)
}

function validateEnvironmentReference(
  key: string,
  location: Partial<ValidationAstIssue>,
  state: ReferenceValidationState,
) {
  const missingFrom = state.ast.matrix
    .map(matrix => matrix.environmentId)
    .filter(environmentId => !state.context.environments[environmentId]?.keys.includes(key))
  if (missingFrom.length)
    state.blockers.push(
      issue(
        'environment-key-not-found',
        `Environment key ${key} is unavailable in: ${missingFrom.join(', ')}.`,
        location,
      ),
    )
}

function validateExtensionReference(
  reference: AstReference,
  location: Partial<ValidationAstIssue>,
  state: ReferenceValidationState,
) {
  const key = `${reference.id}@${reference.version}`
  if (!state.extensions.has(key) || !state.ast.customExtensions.includes(reference.id!))
    state.blockers.push(
      issue('custom-extension-reference-not-found', `Custom extension ${key} was not declared.`, location),
    )
}

function validateStep(
  scenarioId: string,
  step: ValidationAst['scenarios'][number]['steps'][number],
  state: ReferenceValidationState,
) {
  const location = { scenarioId, stepId: step.id }
  const exactReference = step.invocation.step
  const readyDefinition = state.context.stepDefinitions.get(`${exactReference.id}@${exactReference.version}`)
  if (!readyDefinition) {
    state.blockers.push(
      issue(
        'step-reference-not-found',
        `Step Definition ${exactReference.id}@${exactReference.version} was not found.`,
        {
          ...location,
          referenceId: exactReference.id,
        },
      ),
    )
    return
  }
  if (readyDefinition.definitionHash !== exactReference.definitionHash) {
    state.blockers.push(
      issue(
        'step-reference-stale',
        `Step Definition ${exactReference.id}@${exactReference.version} hash is stale.`,
        location,
      ),
    )
    return
  }
  const definition = readyDefinition.definition
  validateDefinitionInputs(definition, step.invocation.inputs, location, state)
  const operation = validateStepExecution(definition, location, state)
  for (const value of Object.values(step.invocation.inputs))
    if (value && typeof value === 'object' && 'ref' in value)
      validateReference(value as AstReference, operation, location, state)
  recordStoredDefinitionOutput(step.invocation.store, definition, location, state)
}

function validateStepExecution(
  definition: StepDefinition,
  location: Partial<ValidationAstIssue>,
  state: ReferenceValidationState,
  visited = new Set<string>(),
): ValidationOperationSemantic | undefined {
  const key = `${definition.identity.id}@${definition.identity.version}`
  if (visited.has(key)) return undefined
  visited.add(key)
  if (definition.execution.kind === 'unbound') {
    state.blockers.push(issue('step-execution-not-supported', `Step Definition ${key} is not runnable.`, location))
    return undefined
  }
  if (definition.execution.kind === 'reviewed-extension') {
    validateDefinitionAvailability(definition, definition.execution.runtime, location, state)
    registerDefinitionSemanticDescriptor(definition, definition.execution.runtime, state)
    return undefined
  }
  if (definition.execution.kind === 'composition') {
    validateCompositionExecution(definition, location, state, visited)
    return undefined
  }
  const operation = resolveOperation(
    state.context.operationRegistry,
    definition.execution.handlerId,
    definition.execution.handlerVersion,
    location,
    state.blockers,
  )
  if (!operation) return undefined
  // The authored contract is the Step Definition, even when it delegates to a
  // shared operation handler.  Keep capability metadata from the selected
  // handler but key semantic consumers (coverage/profile) by the exact step.
  state.operations.set(`${definition.identity.id}@${definition.identity.version}`, {
    ...operation,
    id: definition.identity.id,
    version: definition.identity.version,
  })
  validateOperationAvailability(operation, location, state)
  return operation
}

function validateCompositionExecution(
  definition: StepDefinition,
  location: Partial<ValidationAstIssue>,
  state: ReferenceValidationState,
  visited: Set<string>,
) {
  validateDefinitionAvailability(definition, undefined, location, state)
  registerDefinitionSemanticDescriptor(definition, 'browser', state)
  const definitions = [...state.context.stepDefinitions.values()].map(value => ({
    definition: value.definition,
    status: 'ready' as const,
  }))
  for (const diagnostic of validateStepDefinitionComposition(definition, definitions))
    state.blockers.push(
      issue('step-composition-invalid', diagnostic.message, {
        ...location,
        referenceId: `${definition.identity.id}@${definition.identity.version}`,
      }),
    )
  for (const child of definition.execution.kind === 'composition' ? definition.execution.steps : [])
    validateCompositionChild(child.step, location, state, visited)
}

function validateCompositionChild(
  child: StepInvocation['step'],
  location: Partial<ValidationAstIssue>,
  state: ReferenceValidationState,
  visited: Set<string>,
) {
  const resolved = state.context.stepDefinitions.get(`${child.id}@${child.version}`)
  if (!resolved) {
    state.blockers.push(
      issue('step-composition-child-not-found', `Composition child ${child.id}@${child.version} was not found.`, {
        ...location,
        referenceId: child.id,
      }),
    )
    return
  }
  if (resolved.definitionHash !== child.definitionHash) {
    state.blockers.push(
      issue('step-composition-child-stale', `Composition child ${child.id}@${child.version} hash is stale.`, location),
    )
    return
  }
  validateStepExecution(resolved.definition, location, state, visited)
}

function operationOutputType(type: StepDefinition['outputs'][number]['type']): ValidationOperationSemantic['outputs'][number]['type'] {
  switch (type) {
    case 'string':
    case 'number':
    case 'boolean':
    case 'json':
    case 'locator':
      return type
    case 'artifact-ref':
      return 'artifact'
    default:
      return 'json'
  }
}

function registerDefinitionSemanticDescriptor(
  definition: StepDefinition,
  runtime: ValidationOperationSemantic['runtime'],
  state: ReferenceValidationState,
) {
  state.operations.set(`${definition.identity.id}@${definition.identity.version}`, {
    id: definition.identity.id,
    version: definition.identity.version,
    categories: [definition.human.groupId],
    inputs: definition.inputs.map(input => ({
      name: input.name,
      type: input.type,
      required: input.required,
      description: input.description,
      constraints: input.constraints,
    })),
    outputs: definition.outputs.map(output => ({
      name: output.name,
      type: operationOutputType(output.type),
      description: output.description,
    })),
    runtime,
    capabilities: definition.intent.capabilities,
    deprecated: definition.identity.status === 'deprecated',
    assertionConcerns: [],
    descriptorHash: computeStepReferenceHash(definition),
  })
}

function validateDefinitionAvailability(
  definition: StepDefinition,
  runtime: ValidationOperationSemantic['runtime'] | undefined,
  location: Partial<ValidationAstIssue>,
  state: ReferenceValidationState,
) {
  if (runtime && !state.context.availableRuntimes.includes(runtime))
    state.blockers.push(issue('runtime-unavailable', `Runtime ${runtime} is unavailable.`, location))
  for (const capability of definition.intent.capabilities)
    if (!state.context.availableCapabilities.includes(capability))
      state.blockers.push(issue('capability-unavailable', `Capability ${capability} is unavailable.`, location))
}

function validateOperationAvailability(
  operation: ValidationOperationSemantic,
  location: Partial<ValidationAstIssue>,
  state: ReferenceValidationState,
) {
  if (operation.deprecated) state.warnings.push(issue('deprecated-operation', `Operation ${operation.id} is deprecated.`, location))
  if (!state.context.availableRuntimes.includes(operation.runtime))
    state.blockers.push(
      issue('runtime-unavailable', `Runtime ${operation.runtime} is unavailable.`, location),
    )
  for (const capability of operation.capabilities)
    if (!state.context.availableCapabilities.includes(capability))
      state.blockers.push(issue('capability-unavailable', `Capability ${capability} is unavailable.`, location))
}

function recordStoredDefinitionOutput(
  store: { output: string; as: string } | undefined,
  definition: StepDefinition,
  location: Partial<ValidationAstIssue>,
  state: ReferenceValidationState,
) {
  if (!store) return
  const output = definition.outputs.find(candidate => candidate.name === store.output)
  if (!output)
    state.blockers.push(
      issue(
        'step-output-not-found',
        `Step Definition ${definition.identity.id} does not produce ${store.output}.`,
        location,
      ),
    )
  else if (!output.storable)
    state.blockers.push(
      issue(
        'step-output-not-storable',
        `Step Definition ${definition.identity.id} output ${store.output} is not storable.`,
        location,
      ),
    )
  else state.stored.set(store.as, output.type)
}

function validateReferences(
  ast: ValidationAst,
  proposals: CustomActionExtensionProposal[],
  context: ValidationAstCompilerContext,
) {
  const blockers: ValidationAstIssue[] = []
  const warnings: ValidationAstIssue[] = []
  const operations = new Map<string, ValidationOperationSemantic>()
  const usedLocators = new Map<string, LocatorDescriptor>()
  const locators = new Map(
    context.locatorGraph.nodes
      .filter((node): node is LocatorDescriptor => node.type === 'locator')
      .flatMap(node => [
        [`${node.id}@${node.version}`, node] as const,
        ...(node.persistentId ? [[`${node.persistentId}@${node.version}`, node] as const] : []),
      ]),
  )
  const extensions = new Map(proposals.map(proposal => [`${proposal.id}@${proposal.version}`, proposal]))
  const stored = new Map<string, string>()

  const state = { ast, context, blockers, warnings, operations, usedLocators, locators, extensions, stored }
  for (const scenario of ast.scenarios) {
    stored.clear()
    for (const step of scenario.steps) validateStep(scenario.id, step, state)
  }
  return {
    blockers,
    warnings,
    operations: [...operations.values()],
    locators: [...usedLocators.values()],
  }
}

function compileExtensions(
  proposals: CustomActionExtensionProposal[],
  context: ValidationAstCompilerContext,
  blockers: ValidationAstIssue[],
) {
  const compiled: CompiledCustomExtension[] = []
  for (const proposal of [...proposals].sort((left, right) =>
    `${left.id}@${left.version}`.localeCompare(`${right.id}@${right.version}`),
  )) {
    try {
      compiled.push(
        compileCustomExtension(proposal, {
          policy: context.extensionPolicy,
        }),
      )
    } catch (error) {
      if (!(error instanceof CustomExtensionCompilationError)) throw error
      for (const message of error.issues.sort())
        blockers.push(
          issue('custom-extension-compilation-rejected', message, {
            referenceId: `${proposal.id}@${proposal.version}`,
          }),
        )
    }
  }
  return compiled
}

function validateSubmissionContext(
  submission: ReturnType<typeof validationAstSubmissionSchema.parse>,
  context: ValidationAstCompilerContext,
) {
  const blockers: ValidationAstIssue[] = []
  if (submission.expectedPlanHash !== context.currentPlanHash)
    blockers.push(issue('plan-hash-stale', 'The Validation AST targets a stale plan hash.'))
  for (const taskId of submission.ast.coversTaskIds)
    if (!context.planTaskIds.includes(taskId))
      blockers.push(issue('plan-task-not-found', `Plan task ${taskId} was not found.`, { referenceId: taskId }))
  for (const matrix of submission.ast.matrix)
    if (!context.environments[matrix.environmentId])
      blockers.push(
        issue('environment-not-found', `Environment ${matrix.environmentId} was not found.`, {
          referenceId: matrix.environmentId,
        }),
      )
  const stepCount = submission.ast.scenarios.reduce((count, scenario) => count + scenario.steps.length, 0)
  if (stepCount > VALIDATION_AST_PREVIEW_MAX_STEPS)
    blockers.push(
      issue(
        'preview-limit-exceeded',
        `Validation AST exceeds the ${VALIDATION_AST_PREVIEW_MAX_STEPS}-step preview limit.`,
      ),
    )
  return blockers
}

type CoverageMapping = NonNullable<ValidationAst['coverageArgument']>['mappings'][number]

function claimedCoverageTargets(ast: ValidationAst) {
  return [
    ...ast.coversTaskIds.map(targetId => ({ kind: 'task', targetId })),
    ...ast.qualityConcerns.map(targetId => ({ kind: 'quality-concern', targetId })),
  ]
}

function validateCoverageReferences(
  mapping: CoverageMapping,
  scenarios: Set<string>,
  steps: Map<string, ValidationAst['scenarios'][number]['steps'][number]>,
) {
  const location = { referenceId: mapping.targetId }
  return [
    ...mapping.scenarioIds
      .filter(scenarioId => !scenarios.has(scenarioId))
      .map(scenarioId =>
        issue('coverage-scenario-not-found', `Coverage scenario ${scenarioId} was not found.`, location),
      ),
    ...[...mapping.stimulusStepIds, ...mapping.observationStepIds]
      .filter(stepId => !steps.has(stepId))
      .map(stepId => issue('coverage-step-not-found', `Coverage step ${stepId} was not found.`, location)),
  ]
}

function validateCoverageObservations(
  mapping: CoverageMapping,
  steps: Map<string, ValidationAst['scenarios'][number]['steps'][number]>,
  operationByIdentity: Map<string, ValidationOperationSemantic>,
) {
  const location = { referenceId: mapping.targetId }
  const missingObservation =
    ['covered', 'partial'].includes(mapping.state) && mapping.observationStepIds.length === 0
      ? [issue('coverage-observation-required', 'Covered and partial mappings require an observation step.', location)]
      : []
  const unobservable = mapping.observationStepIds.flatMap(stepId => {
    const step = steps.get(stepId)
    if (!step) return []
    const operation = operationByIdentity.get(`${step.invocation.step.id}@${step.invocation.step.version}`)
    return operation?.capabilities.includes('assertions')
      ? []
      : [
          issue(
            'coverage-observation-not-observable',
            `Observation step ${stepId} does not use a registered assertion capability.`,
            location,
          ),
        ]
  })
  return [...missingObservation, ...unobservable]
}

function coverageWarnings(mapping: CoverageMapping) {
  const location = { referenceId: mapping.targetId }
  return [
    ...(['deferred', 'uncovered', 'partial'].includes(mapping.state) && !mapping.limitation
      ? [issue('coverage-limitation-recommended', `${mapping.state} coverage should explain its limitation.`, location)]
      : []),
    ...(mapping.state === 'covered' && mapping.stimulusStepIds.length === 0
      ? [issue('coverage-stimulus-suspicious', 'Covered mapping has no explicit stimulus step.', location)]
      : []),
  ]
}

function coverageStateBlockers(mapping: CoverageMapping) {
  if (mapping.state === 'uncovered')
    return [
      issue('coverage-uncovered', `Explicit requirement ${mapping.targetId} is uncovered.`, {
        referenceId: mapping.targetId,
      }),
    ]
  if (mapping.state === 'partial' && !mapping.partialAcknowledgement)
    return [
      issue(
        'coverage-partial-acknowledgement-required',
        `Partial coverage for ${mapping.targetId} requires an exact reviewed acknowledgement.`,
        { referenceId: mapping.targetId },
      ),
    ]
  return []
}

function validateCoverageArgument(ast: ValidationAst, operations: ValidationOperationSemantic[]) {
  const blockers: ValidationAstIssue[] = []
  const warnings: ValidationAstIssue[] = []
  const mappings = ast.coverageArgument?.mappings ?? []
  const claimedTargets = claimedCoverageTargets(ast)
  if (!ast.coverageArgument) {
    if (claimedTargets.length > 1)
      blockers.push(
        issue(
          'coverage-argument-required',
          'Broad task or quality coverage claims require an explicit reviewable coverage argument.',
        ),
      )
    return { blockers, warnings }
  }
  const scenarios = new Set(ast.scenarios.map(scenario => scenario.id))
  const steps = new Map(ast.scenarios.flatMap(scenario => scenario.steps.map(step => [step.id, step] as const)))
  const operationByIdentity = new Map(operations.map(operation => [`${operation.id}@${operation.version}`, operation]))
  for (const claim of claimedTargets) {
    if (!mappings.some(mapping => mapping.kind === claim.kind && mapping.targetId === claim.targetId))
      blockers.push(
        issue('coverage-mapping-missing', `Coverage mapping is missing for ${claim.kind} ${claim.targetId}.`, {
          referenceId: claim.targetId,
        }),
      )
  }
  for (const mapping of mappings) {
    blockers.push(...validateCoverageReferences(mapping, scenarios, steps))
    blockers.push(...validateCoverageObservations(mapping, steps, operationByIdentity))
    blockers.push(...coverageStateBlockers(mapping))
    warnings.push(...coverageWarnings(mapping))
  }
  return { blockers, warnings }
}

const SEMANTIC_TOKEN_STOP_WORDS = new Set([
  'apr',
  'after',
  'assert',
  'before',
  'button',
  'click',
  'element',
  'item',
  'locator',
  'page',
  'result',
  'should',
  'state',
  'target',
  'that',
  'then',
  'this',
  'user',
  'with',
])

function semanticTokens(step: ValidationAst['scenarios'][number]['steps'][number]) {
  const inputText = Object.values(step.invocation.inputs)
    .flatMap(value => {
      if (typeof value === 'string') return [value]
      if (value && typeof value === 'object' && 'id' in value && typeof value.id === 'string') return [value.id]
      return []
    })
    .join(' ')
  return new Set(
    `${stepDescription(step)} ${inputText}`
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(token => token.length > 2 && !SEMANTIC_TOKEN_STOP_WORDS.has(token)),
  )
}

function hasSharedSemanticToken(
  left: ValidationAst['scenarios'][number]['steps'][number],
  right: ValidationAst['scenarios'][number]['steps'][number],
) {
  const rightTokens = semanticTokens(right)
  return [...semanticTokens(left)].some(token => rightTokens.has(token))
}

function describesEntityDestruction(description: string) {
  return (
    /\b(delete(?:s|ing)?|remove(?:s|ing)?|discard(?:s|ing)?)\b/i.test(description) ||
    /\bclear(?:s|ed|ing)?\s+(?:all\b|stored\b|saved\b|persisted\b|local\s+(?:data|state)\b)/i.test(description)
  )
}

type ValidationScenario = ValidationAst['scenarios'][number]

function persistenceObservationWarnings(
  mapping: CoverageMapping,
  scenario: ValidationScenario,
  observationStepId: string,
) {
  const observationIndex = scenario.steps.findIndex(step => step.id === observationStepId)
  if (observationIndex < 0) return []
  const observation = scenario.steps[observationIndex]!
  const warnings: ValidationAstIssue[] = []
  const reloadIndex = scenario.steps.findIndex(step => step.invocation.step.id === 'browser.navigation.reload')
  if (reloadIndex < 0 || observationIndex <= reloadIndex) {
    warnings.push(
      issue(
        'semantic-persistence-observation-before-reload',
        `Persistence observation ${observation.id} is not performed after a page reload.`,
        { scenarioId: scenario.id, stepId: observation.id, referenceId: mapping.targetId },
      ),
    )
  }
  const destructive = scenario.steps
    .slice(0, observationIndex)
    .find(step => describesEntityDestruction(stepDescription(step)) && hasSharedSemanticToken(step, observation))
  if (destructive) {
    warnings.push(
      issue(
        'semantic-persistence-target-destroyed',
        `Persistence observation ${observation.id} appears to inspect an entity already removed by ${destructive.id}.`,
        { scenarioId: scenario.id, stepId: observation.id, referenceId: destructive.id },
      ),
    )
  }
  return warnings
}

function persistenceMappingWarnings(ast: ValidationAst, mapping: CoverageMapping) {
  return mapping.scenarioIds.flatMap(scenarioId => {
    const scenario = ast.scenarios.find(candidate => candidate.id === scenarioId)
    return scenario
      ? mapping.observationStepIds.flatMap(stepId => persistenceObservationWarnings(mapping, scenario, stepId))
      : []
  })
}

function validateSemanticConsistency(ast: ValidationAst) {
  return (ast.coverageArgument?.mappings ?? [])
    .filter(
      mapping =>
        mapping.kind === 'quality-concern' &&
        mapping.targetId === 'persistence' &&
        ['covered', 'partial'].includes(mapping.state),
    )
    .flatMap(mapping => persistenceMappingWarnings(ast, mapping))
}

function referencedExtensionIds(ast: ValidationAst) {
  return new Set(validationAstExtensionReferences(ast).map(value => value.id))
}

function validateExtensionIdentitySets(
  ast: ValidationAst,
  proposals: CustomActionExtensionProposal[],
): ValidationAstIssue[] {
  const declared = new Set(ast.customExtensions)
  const proposed = new Set(proposals.map(proposal => proposal.id))
  const referenced = referencedExtensionIds(ast)
  return [...new Set([...declared, ...proposed, ...referenced])]
    .sort()
    .filter(id => !declared.has(id) || !proposed.has(id) || !referenced.has(id))
    .map(id =>
      issue('custom-extension-set-mismatch', `Custom extension ${id} must be declared, proposed, and referenced.`, {
        referenceId: id,
      }),
    )
}

export function checkValidationAst(value: unknown, context: ValidationAstCompilerContext) {
  const submission = validationAstSubmissionSchema.parse(value)
  const blockers = validateSubmissionContext(submission, context)
  const references = validateReferences(submission.ast, submission.customExtensionProposals, context)
  blockers.push(...references.blockers)
  const coverage = validateCoverageArgument(submission.ast, references.operations)
  blockers.push(...coverage.blockers)
  if (submission.authoringProfile)
    blockers.push(
      ...checkValidationAstAuthoringProfile(submission.ast, submission.authoringProfile, references.operations),
    )
  blockers.push(...validateExtensionIdentitySets(submission.ast, submission.customExtensionProposals))
  const compiledExtensions = compileExtensions(submission.customExtensionProposals, context, blockers)
  return {
    valid: blockers.length === 0,
    blockers,
    warnings: [...references.warnings, ...coverage.warnings, ...validateSemanticConsistency(submission.ast)],
    submission,
    extensionPolicy: context.extensionPolicy,
    resolved: { ...references, compiledExtensions },
  }
}

export function previewValidationAst(value: unknown, context: ValidationAstCompilerContext) {
  const checked = checkValidationAst(value, context)
  const ast = checked.submission.ast
  const canonicalProjection = createValidationAstCanonicalProjection(
    ast,
    context.planScope,
    locatorBindingsForAst(ast, context.locatorGraph, context.planScope),
  )
  const gherkin = canonicalProjection.gherkin
  const entities = canonicalProjection.validationNode.appraiseArtifacts.testCases.map((testCase, index) => ({
    scenarioId: ast.scenarios[index]!.id,
    caseId: testCase.id,
    stepIds: testCase.steps.map(step => step.id),
  }))
  const commandReceipt = {
    schemaVersion: '1' as const,
    catalogHash: context.operationRegistry.manifestHash,
    locatorGraphHash: context.locatorGraph.contentHash,
    environments: ast.matrix.map(item => item.environmentId).sort(),
    browsers: ast.matrix
      .map(item => item.browser)
      .filter(Boolean)
      .sort(),
    runtimes: [...new Set(checked.resolved.operations.map(operation => operation.runtime))].sort(),
  }
  const preview = {
    expectedPlanHash: checked.submission.expectedPlanHash,
    authoringProfile: checked.submission.authoringProfile ?? null,
    astHash: hash(ast),
    entities,
    operations: checked.resolved.operations.map(operation => ({
      id: operation.id,
      version: operation.version,
      contentHash: operation.descriptorHash,
    })),
    locators: checked.resolved.locators.map(locator => ({
      id: locator.id,
      version: locator.version,
      contentHash: locator.contentHash,
    })),
    customExtensions: checked.resolved.compiledExtensions,
    extensionPolicy: checked.extensionPolicy,
    gherkin,
    canonicalProjection,
    commandReceipt: { ...commandReceipt, contentHash: hash(commandReceipt) },
    blockers: checked.blockers,
    warnings: checked.warnings,
  }
  return { ...preview, previewHash: hash(preview), valid: checked.valid }
}
