import type { ActionDescriptor, createActionCatalog } from '@/lib/action-catalog'
import type { LocatorDescriptor, LocatorGraph } from '@/lib/locator-graph'

import {
  compileCustomExtension,
  CustomExtensionCompilationError,
  type CompiledCustomExtension,
} from './custom-extension-compiler'
import type { CustomExtensionPolicy } from './extension-policy'
import { validationAstSubmissionSchema, type CustomActionExtensionProposal, type ValidationAst } from './schemas'

export const VALIDATION_AST_PREVIEW_MAX_STEPS = 100

type ActionCatalogReader = Pick<ReturnType<typeof createActionCatalog>, 'catalogHash' | 'readActions'>

export type ValidationAstCompilerContext = {
  project: { id: string; fingerprint: string }
  planScope: string
  currentPlanHash: string
  planTaskIds: string[]
  actionCatalog: ActionCatalogReader
  locatorGraph: LocatorGraph
  environments: Record<string, { keys: string[] }>
  availableRuntimes: Array<ActionDescriptor['requirements']['runtime']>
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

function scalarType(value: unknown) {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return typeof value
  if (value && typeof value === 'object' && 'ref' in value) return String((value as { ref: unknown }).ref)
  return 'unknown'
}

function issue(code: string, message: string, location: Partial<ValidationAstIssue> = {}): ValidationAstIssue {
  return { code, message, ...location }
}

function resolveAction(
  catalog: ActionCatalogReader,
  id: string,
  version: string,
  location: Partial<ValidationAstIssue>,
  blockers: ValidationAstIssue[],
) {
  try {
    return catalog.readActions([{ id, version }])[0]!
  } catch {
    blockers.push(
      issue('action-reference-not-found', `Action ${id}@${version} was not found.`, { ...location, referenceId: id }),
    )
    return undefined
  }
}

function validateActionInputs(
  action: ActionDescriptor,
  inputs: Record<string, unknown>,
  storedTypes: Map<string, string>,
  location: Partial<ValidationAstIssue>,
  blockers: ValidationAstIssue[],
) {
  const definitions = new Map(action.inputs.map(input => [input.name, input]))
  for (const definition of action.inputs) {
    if (definition.required && inputs[definition.name] === undefined)
      blockers.push(issue('required-action-input-missing', `Required input ${definition.name} is missing.`, location))
  }
  for (const [name, value] of Object.entries(inputs)) {
    const definition = definitions.get(name)
    if (!definition) {
      blockers.push(issue('unknown-action-input', `Input ${name} is not declared by ${action.id}.`, location))
      continue
    }
    validateActionInputValue(name, value, definition, storedTypes, location, blockers)
  }
}

function validateActionInputValue(
  name: string,
  value: unknown,
  definition: ActionDescriptor['inputs'][number],
  storedTypes: Map<string, string>,
  location: Partial<ValidationAstIssue>,
  blockers: ValidationAstIssue[],
) {
  const actual = resolveActionInputType(value, storedTypes)
  if (isIncompatibleActionInputType(actual, definition.type))
    blockers.push(
      issue('action-input-type-mismatch', `Input ${name} requires ${definition.type}, received ${actual}.`, location),
    )
  blockers.push(...numericInputIssues(name, value, definition.numeric, location))
}

function resolveActionInputType(value: unknown, storedTypes: Map<string, string>) {
  const type = scalarType(value)
  if (type !== 'stored' || !value || typeof value !== 'object' || !('name' in value)) return type
  return storedTypes.get(String(value.name))
}

function isIncompatibleActionInputType(actual: string | undefined, expected: string) {
  return Boolean(actual && actual !== expected && actual !== 'environment' && actual !== 'custom-extension')
}

function numericInputIssues(
  name: string,
  value: unknown,
  bounds: ActionDescriptor['inputs'][number]['numeric'],
  location: Partial<ValidationAstIssue>,
) {
  if (typeof value !== 'number' || !bounds) return []
  const issues: ValidationAstIssue[] = []
  if (bounds.minimum !== undefined && value < bounds.minimum)
    issues.push(issue('action-input-below-minimum', `Input ${name} is below its minimum.`, location))
  if (bounds.maximum !== undefined && value > bounds.maximum)
    issues.push(issue('action-input-above-maximum', `Input ${name} exceeds its maximum.`, location))
  return issues
}

function validateLocator(
  locator: LocatorDescriptor,
  action: ActionDescriptor,
  context: ValidationAstCompilerContext,
  location: Partial<ValidationAstIssue>,
  blockers: ValidationAstIssue[],
) {
  if (
    locator.compatibleActionCategories.length &&
    !action.categories.some(category => locator.compatibleActionCategories.includes(category))
  )
    blockers.push(
      issue('locator-action-incompatible', `Locator ${locator.id} is not compatible with action ${action.id}.`, {
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
  actions: Map<string, ActionDescriptor>
  usedLocators: Map<string, LocatorDescriptor>
  locators: Map<string, LocatorDescriptor>
  extensions: Map<string, CustomActionExtensionProposal>
  stored: Map<string, string>
}

type AstReference = { ref: string; id?: string; version?: string; name?: string; key?: string }

function validateReference(
  reference: AstReference,
  action: ActionDescriptor,
  location: Partial<ValidationAstIssue>,
  state: ReferenceValidationState,
) {
  if (reference.ref === 'locator') validateLocatorReference(reference, action, location, state)
  if (reference.ref === 'stored' && reference.name && !state.stored.has(reference.name))
    state.blockers.push(
      issue('stored-value-unavailable', `Stored value ${reference.name} is not available before this step.`, location),
    )
  if (reference.ref === 'environment' && reference.key) validateEnvironmentReference(reference.key, location, state)
  if (reference.ref === 'custom-extension') validateExtensionReference(reference, location, state)
}

function validateLocatorReference(
  reference: AstReference,
  action: ActionDescriptor,
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
  validateLocator(locator, action, state.context, location, state.blockers)
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
  const action = resolveAction(
    state.context.actionCatalog,
    step.action.id,
    step.action.version,
    location,
    state.blockers,
  )
  if (!action) return
  state.actions.set(`${action.id}@${action.version}`, action)
  validateActionAvailability(action, location, state)
  validateActionInputs(action, step.action.inputs, state.stored, location, state.blockers)
  for (const value of Object.values(step.action.inputs))
    if (value && typeof value === 'object' && 'ref' in value)
      validateReference(value as AstReference, action, location, state)
  recordStoredOutput(step.store, action, location, state)
}

function validateActionAvailability(
  action: ActionDescriptor,
  location: Partial<ValidationAstIssue>,
  state: ReferenceValidationState,
) {
  if (action.deprecated) state.warnings.push(issue('deprecated-action', `Action ${action.id} is deprecated.`, location))
  if (!state.context.availableRuntimes.includes(action.requirements.runtime))
    state.blockers.push(
      issue('runtime-unavailable', `Runtime ${action.requirements.runtime} is unavailable.`, location),
    )
  for (const capability of action.requirements.capabilities)
    if (!state.context.availableCapabilities.includes(capability))
      state.blockers.push(issue('capability-unavailable', `Capability ${capability} is unavailable.`, location))
}

function recordStoredOutput(
  store: { output: string; as: string } | undefined,
  action: ActionDescriptor,
  location: Partial<ValidationAstIssue>,
  state: ReferenceValidationState,
) {
  if (!store) return
  const output = action.outputs.find(candidate => candidate.name === store.output)
  if (!output)
    state.blockers.push(
      issue('action-output-not-found', `Action ${action.id} does not produce ${store.output}.`, location),
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
  const actions = new Map<string, ActionDescriptor>()
  const usedLocators = new Map<string, LocatorDescriptor>()
  const locators = new Map(
    context.locatorGraph.nodes
      .filter((node): node is LocatorDescriptor => node.type === 'locator')
      .map(node => [`${node.id}@${node.version}`, node]),
  )
  const extensions = new Map(proposals.map(proposal => [`${proposal.id}@${proposal.version}`, proposal]))
  const stored = new Map<string, string>()

  const state = { ast, context, blockers, warnings, actions, usedLocators, locators, extensions, stored }
  for (const scenario of ast.scenarios) {
    stored.clear()
    for (const step of scenario.steps) validateStep(scenario.id, step, state)
  }
  return {
    blockers,
    warnings,
    actions: [...actions.values()],
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
  actionByIdentity: Map<string, ActionDescriptor>,
) {
  const location = { referenceId: mapping.targetId }
  const missingObservation =
    ['covered', 'partial'].includes(mapping.state) && mapping.observationStepIds.length === 0
      ? [issue('coverage-observation-required', 'Covered and partial mappings require an observation step.', location)]
      : []
  const unobservable = mapping.observationStepIds.flatMap(stepId => {
    const step = steps.get(stepId)
    if (!step) return []
    const action = actionByIdentity.get(`${step.action.id}@${step.action.version}`)
    return action?.requirements.capabilities.includes('assertions')
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

function validateCoverageArgument(ast: ValidationAst, actions: ActionDescriptor[]) {
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
  const actionByIdentity = new Map(actions.map(action => [`${action.id}@${action.version}`, action]))
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
    blockers.push(...validateCoverageObservations(mapping, steps, actionByIdentity))
    warnings.push(...coverageWarnings(mapping))
  }
  return { blockers, warnings }
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
  const coverage = validateCoverageArgument(submission.ast, references.actions)
  blockers.push(...coverage.blockers)
  if (submission.authoringProfile)
    blockers.push(
      ...checkValidationAstAuthoringProfile(submission.ast, submission.authoringProfile, references.actions),
    )
  blockers.push(...validateExtensionIdentitySets(submission.ast, submission.customExtensionProposals))
  const compiledExtensions = compileExtensions(submission.customExtensionProposals, context, blockers)
  return {
    valid: blockers.length === 0,
    blockers,
    warnings: [...references.warnings, ...coverage.warnings],
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
    catalogHash: context.actionCatalog.catalogHash,
    locatorGraphHash: context.locatorGraph.contentHash,
    environments: ast.matrix.map(item => item.environmentId).sort(),
    browsers: ast.matrix
      .map(item => item.browser)
      .filter(Boolean)
      .sort(),
    runtimes: [...new Set(checked.resolved.actions.map(action => action.requirements.runtime))].sort(),
  }
  const preview = {
    expectedPlanHash: checked.submission.expectedPlanHash,
    authoringProfile: checked.submission.authoringProfile ?? null,
    astHash: hash(ast),
    entities,
    actions: checked.resolved.actions.map(action => ({
      id: action.id,
      version: action.version,
      contentHash: action.contentHash,
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
