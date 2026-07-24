import { randomUUID } from 'node:crypto'

import type { Prisma, PrismaClient } from '@prisma/client'
import {
  canonicalStepDefinitionJson,
  computeStepDefinitionHashes,
  computeStepReferenceHash,
  stepDefinitionContentHash,
  stepDefinitionSchema,
  type StepDefinition,
} from '../../../packages/cucumber-runtime/src/step-definitions/index.ts'

const CONVERTER_VERSION = 'step-block-composition-v1'
const legacyCompatibilityKind = 'template-step-id'
const identifierPattern = /^[a-z][a-zA-Z0-9-]*$/

export type StepBlockMigrationClassification =
  | 'convertible-draft'
  | 'incomplete-custom-child'
  | 'invalid-parameter-map'
  | 'stale-legacy-proof'
  | 'identity-conflict'
  | 'source-drift'

export type StepBlockMigrationStatus = 'global-review-required' | 'quarantined' | 'source-drift'

export type StepBlockMigrationDiagnostic = { code: StepBlockMigrationClassification; path: string; message: string }

export type StepBlockMigrationResult = {
  sourceStepBlockId: string
  sourceHash: string
  classification: StepBlockMigrationClassification
  status: StepBlockMigrationStatus
  diagnostics: StepBlockMigrationDiagnostic[]
  proposedDraft: { stepId: string; version: string } | null
  draftId: string | null
}

type ReadyDefinition = { id: string; version: string; definitionHash: string; definition: StepDefinition }
type ResolvedChild = { templateStepId: string; definition: ReadyDefinition; parameterMap: Record<string, string> }
type Candidate = {
  result: StepBlockMigrationResult
  snapshotJson: string
  sourceHash: string
  draftDefinition: unknown | null
}

const stepBlockInclude = {
  steps: {
    orderBy: { order: 'asc' },
    include: {
      templateStep: {
        select: {
          id: true,
          operationId: true,
          operationVersion: true,
          operationMigrationState: true,
          functionDefinition: true,
        },
      },
    },
  },
} satisfies Prisma.StepBlockInclude

async function loadMigrationBlocks(database: PrismaClient) {
  return database.stepBlock.findMany({ orderBy: { id: 'asc' }, include: stepBlockInclude })
}

async function loadCompatibilityReferences(database: PrismaClient, templateStepIds: string[]) {
  return database.stepCompatibilityReference.findMany({
    where: { legacyKind: legacyCompatibilityKind, legacyValue: { in: templateStepIds } },
    include: { definition: { include: { humanProjection: true, executionBinding: true } } },
    orderBy: [{ legacyValue: 'asc' }, { stepId: 'asc' }, { stepVersion: 'asc' }],
  })
}

type MigrationBlock = Awaited<ReturnType<typeof loadMigrationBlocks>>[number]
type MigrationReference = Awaited<ReturnType<typeof loadCompatibilityReferences>>[number]
type MigrationLedger = Awaited<ReturnType<PrismaClient['stepBlockMigrationLedger']['findMany']>>[number]

function proposedIdentity(sourceStepBlockId: string) {
  const normalized = sourceStepBlockId.toLowerCase().replaceAll(/[^a-z0-9.-]+/g, '-')
  return { id: `migration.step-block.${normalized}`, version: '1' }
}

function diagnostic(
  code: StepBlockMigrationClassification,
  path: string,
  message: string,
): StepBlockMigrationDiagnostic {
  return { code, path, message }
}

function parseParameterMap(value: string, path: string) {
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object')
      return { map: null, diagnostic: diagnostic('invalid-parameter-map', path, 'Parameter map must be an object.') }
    const entries = Object.entries(parsed)
    if (
      entries.some(
        ([childInput, parentName]) =>
          !identifierPattern.test(childInput) || typeof parentName !== 'string' || !identifierPattern.test(parentName),
      )
    )
      return {
        map: null,
        diagnostic: diagnostic(
          'invalid-parameter-map',
          path,
          'Parameter maps must map exact child input names to exact parent input names.',
        ),
      }
    return { map: Object.fromEntries(entries) as Record<string, string>, diagnostic: null }
  } catch {
    return { map: null, diagnostic: diagnostic('invalid-parameter-map', path, 'Parameter map is not valid JSON.') }
  }
}

function migrationDraft(
  source: {
    id: string
    name: string
    description: string | null
    intent: string | null
    createdAt: Date
    updatedAt: Date
  },
  children: ResolvedChild[],
  snapshot: unknown,
) {
  const identity = proposedIdentity(source.id)
  return {
    schemaVersion: '1',
    identity: { ...identity, status: 'draft' },
    provenance: {
      creationMethod: 'migration',
      createdBy: CONVERTER_VERSION,
      createdAt: source.createdAt.toISOString(),
      sourceReference: `step-block:${source.id}`,
    },
    intent: {
      title: source.name,
      description: source.description ?? '',
      legacyIntent: source.intent,
    },
    inputs: [],
    outputs: [],
    human: {
      signature: source.name,
      keywordCompatibility: ['When'],
      parameterBindings: [],
      groupId: 'migration',
    },
    agent: { summary: source.intent ?? source.description ?? source.name, usageGuidance: '', examples: [] },
    execution: {
      kind: 'composition',
      steps: children.map(child => ({
        step: {
          id: child.definition.id,
          version: child.definition.version,
          definitionHash: child.definition.definitionHash,
        },
        inputs: Object.fromEntries(
          Object.entries(child.parameterMap).map(([childInput, parentName]) => [childInput, { input: parentName }]),
        ),
      })),
    },
    lifecycle: {},
    migrationSnapshot: snapshot,
  }
}

function sourceSnapshot(block: MigrationBlock, referencesByTemplate: Map<string, MigrationReference[]>) {
  return {
    source: {
      id: block.id,
      name: block.name,
      description: block.description,
      intent: block.intent,
      createdAt: block.createdAt.toISOString(),
      updatedAt: block.updatedAt.toISOString(),
      targetProjectId: block.targetProjectId,
    },
    steps: block.steps.map(step => ({
      id: step.id,
      order: step.order,
      templateStepId: step.templateStepId,
      parameterMap: step.parameterMap,
      operationInvocationJson: step.operationInvocationJson,
      compositionVersionHash: step.compositionVersionHash,
      templateMapping: {
        operationId: step.templateStep.operationId,
        operationVersion: step.templateStep.operationVersion,
        operationMigrationState: step.templateStep.operationMigrationState,
        hasFunctionDefinition: Boolean(step.templateStep.functionDefinition),
        functionDefinitionHash: step.templateStep.functionDefinition
          ? stepDefinitionContentHash(step.templateStep.functionDefinition)
          : null,
      },
      compatibilityProof: (referencesByTemplate.get(step.templateStepId) ?? []).map(reference => ({
        stepId: reference.stepId,
        stepVersion: reference.stepVersion,
        status: reference.definition.status,
        definitionHash: reference.definition.definitionHash,
        humanProjectionHash: reference.definition.humanProjectionHash,
        agentContractHash: reference.definition.agentContractHash,
        executionHash: reference.definition.executionHash,
        definitionJson: reference.definition.definitionJson,
        boundHumanProjectionHash: reference.definition.humanProjection?.projectionHash ?? null,
        humanProjectionJson: reference.definition.humanProjection?.projectionJson ?? null,
        executionBindingHash: reference.definition.executionBinding?.bindingHash ?? null,
        executionBindingJson: reference.definition.executionBinding?.bindingJson ?? null,
      })),
    })),
  }
}

function driftCandidate(
  block: MigrationBlock,
  sourceHash: string,
  snapshotJson: string,
  previous: MigrationLedger,
  message: string,
): Candidate {
  return {
    sourceHash,
    snapshotJson,
    draftDefinition: null,
    result: {
      sourceStepBlockId: block.id,
      sourceHash,
      classification: 'source-drift',
      status: 'source-drift',
      diagnostics: [diagnostic('source-drift', 'source', message)],
      proposedDraft:
        previous.proposedStepId && previous.proposedVersion
          ? { stepId: previous.proposedStepId, version: previous.proposedVersion }
          : null,
      draftId: previous.draftId,
    },
  }
}

function resolveCompatibilityReference(
  step: MigrationBlock['steps'][number],
  references: MigrationReference[],
): MigrationReference | StepBlockMigrationDiagnostic {
  const path = `steps.${step.order}.templateStepId`
  const cardinalityDiagnostic = compatibilityCardinalityDiagnostic(step, references.length, path)
  if (cardinalityDiagnostic) return cardinalityDiagnostic
  const reference = references[0]!
  const resolutionDiagnostic = compatibilityResolutionDiagnostic(step, reference, path)
  if (resolutionDiagnostic) return resolutionDiagnostic
  return reference
}

function compatibilityCardinalityDiagnostic(
  step: MigrationBlock['steps'][number],
  count: number,
  path: string,
): StepBlockMigrationDiagnostic | null {
  if (count > 1) return diagnostic('identity-conflict', path, 'Template Step has multiple compatibility references.')
  if (count === 0) return missingCompatibilityDiagnostic(step, path)
  return null
}

function missingCompatibilityDiagnostic(
  step: MigrationBlock['steps'][number],
  path: string,
): StepBlockMigrationDiagnostic {
  const custom =
    step.templateStep.operationMigrationState === 'manual-only-custom' || Boolean(step.templateStep.functionDefinition)
  return diagnostic(
    custom ? 'incomplete-custom-child' : 'stale-legacy-proof',
    path,
    custom
      ? 'Custom child has no exact ready Step Definition compatibility reference.'
      : 'Legacy child has no exact ready Step Definition compatibility reference.',
  )
}

function compatibilityResolutionDiagnostic(
  step: MigrationBlock['steps'][number],
  reference: MigrationReference,
  path: string,
): StepBlockMigrationDiagnostic | null {
  if (reference.definition.status !== 'ready')
    return diagnostic('stale-legacy-proof', path, 'Compatibility reference does not resolve to a ready definition.')
  if (legacyIdentityConflicts(step, reference))
    return diagnostic(
      'identity-conflict',
      path,
      'Legacy mapping and compatibility reference resolve to different identities.',
    )
  return null
}

function legacyIdentityConflicts(step: MigrationBlock['steps'][number], reference: MigrationReference) {
  return (
    (step.templateStep.operationId && step.templateStep.operationId !== reference.stepId) ||
    (step.templateStep.operationVersion && step.templateStep.operationVersion !== reference.stepVersion)
  )
}

function hasValidPersistedProof(definition: StepDefinition, reference: MigrationReference) {
  const hashes = computeStepDefinitionHashes(definition)
  return proofValues(definition, hashes, reference).every(([actual, expected]) => actual === expected)
}

function proofValues(
  definition: StepDefinition,
  hashes: ReturnType<typeof computeStepDefinitionHashes>,
  reference: MigrationReference,
): Array<[string | null | undefined, string | null | undefined]> {
  return [
    [hashes.definitionHash, reference.definition.definitionHash],
    [hashes.humanProjectionHash, reference.definition.humanProjectionHash],
    [hashes.agentContractHash, reference.definition.agentContractHash],
    [hashes.executionHash, reference.definition.executionHash],
    [hashes.humanProjectionHash, reference.definition.humanProjection?.projectionHash],
    [canonicalStepDefinitionJson(definition.human), reference.definition.humanProjection?.projectionJson],
    [hashes.executionHash, reference.definition.executionBinding?.bindingHash],
    [canonicalStepDefinitionJson(definition.execution), reference.definition.executionBinding?.bindingJson],
  ]
}

function resolveReadyDefinition(
  reference: MigrationReference,
  path: string,
): ReadyDefinition | StepBlockMigrationDiagnostic {
  try {
    const parsed = stepDefinitionSchema.safeParse(JSON.parse(reference.definition.definitionJson))
    if (!parsed.success || !hasValidPersistedProof(parsed.data, reference))
      return diagnostic('stale-legacy-proof', path, 'Ready definition proof is stale or invalid.')
    return {
      id: reference.definition.id,
      version: reference.definition.version,
      definitionHash: computeStepReferenceHash(parsed.data),
      definition: parsed.data,
    }
  } catch {
    return diagnostic('stale-legacy-proof', path, 'Ready definition proof is malformed JSON.')
  }
}

function resolveChild(
  step: MigrationBlock['steps'][number],
  referencesByTemplate: Map<string, MigrationReference[]>,
): ResolvedChild | StepBlockMigrationDiagnostic {
  const path = `steps.${step.order}`
  const parameter = parseParameterMap(step.parameterMap, `${path}.parameterMap`)
  if (parameter.diagnostic) return parameter.diagnostic
  const reference = resolveCompatibilityReference(step, referencesByTemplate.get(step.templateStepId) ?? [])
  if ('code' in reference) return reference
  const definition = resolveReadyDefinition(reference, `${path}.templateStepId`)
  if ('code' in definition) return definition
  const childInputs = new Map(definition.definition.inputs.map(input => [input.name, input]))
  const unknown = Object.keys(parameter.map!).find(name => !childInputs.has(name))
  const missing = [...childInputs.values()].find(
    input => input.required && input.defaultValue === undefined && !Object.hasOwn(parameter.map!, input.name),
  )
  if (unknown || missing)
    return diagnostic(
      'invalid-parameter-map',
      `${path}.parameterMap`,
      unknown
        ? `Parameter map names unknown child input ${unknown}.`
        : `Parameter map omits required child input ${missing!.name}.`,
    )
  return { templateStepId: step.templateStepId, parameterMap: parameter.map!, definition }
}

function candidateForBlock(
  block: MigrationBlock,
  referencesByTemplate: Map<string, MigrationReference[]>,
  previous: MigrationLedger | undefined,
): Candidate {
  const snapshot = sourceSnapshot(block, referencesByTemplate)
  const snapshotJson = canonicalStepDefinitionJson(snapshot)
  const sourceHash = stepDefinitionContentHash(snapshot)
  const drift = sourceDriftCandidate(block, sourceHash, snapshotJson, previous)
  if (drift) return drift
  const resolved = block.steps.map(step => resolveChild(step, referencesByTemplate))
  const diagnostics = resolved.filter((value): value is StepBlockMigrationDiagnostic => 'code' in value)
  const children = resolved.filter((value): value is ResolvedChild => !('code' in value))
  const classification = diagnostics[0]?.code ?? 'convertible-draft'
  const status: StepBlockMigrationStatus =
    classification === 'convertible-draft' ? 'global-review-required' : 'quarantined'
  const identity = proposedIdentity(block.id)
  return {
    sourceHash,
    snapshotJson,
    draftDefinition: classification === 'convertible-draft' ? migrationDraft(block, children, snapshot) : null,
    result: {
      sourceStepBlockId: block.id,
      sourceHash,
      classification,
      status,
      diagnostics,
      proposedDraft: classification === 'convertible-draft' ? { stepId: identity.id, version: identity.version } : null,
      draftId: previous?.draftId ?? null,
    },
  }
}

function sourceDriftCandidate(
  block: MigrationBlock,
  sourceHash: string,
  snapshotJson: string,
  previous: MigrationLedger | undefined,
): Candidate | null {
  if (!previous) return null
  if (previous.sourceHash !== sourceHash)
    return driftCandidate(
      block,
      sourceHash,
      snapshotJson,
      previous,
      'The legacy Step Block changed after migration evidence was recorded.',
    )
  if (previous.status === 'source-drift')
    return driftCandidate(
      block,
      sourceHash,
      snapshotJson,
      previous,
      'Source drift is quarantined until a reviewer explicitly resolves the migration evidence.',
    )
  return null
}

export class StepBlockMigrationService {
  constructor(private readonly database: PrismaClient) {}

  async preview(): Promise<StepBlockMigrationResult[]> {
    return (await this.collect()).map(candidate => candidate.result)
  }

  async applyDrafts(): Promise<StepBlockMigrationResult[]> {
    const candidates = await this.collect()
    const results: StepBlockMigrationResult[] = []
    for (const candidate of candidates) {
      const applied = await this.applyCandidate(candidate)
      results.push(applied)
    }
    return results.sort((left, right) => left.sourceStepBlockId.localeCompare(right.sourceStepBlockId))
  }

  private async collect(): Promise<Candidate[]> {
    const blocks = await loadMigrationBlocks(this.database)
    const templateStepIds = [...new Set(blocks.flatMap(block => block.steps.map(step => step.templateStepId)))].sort()
    const references = await loadCompatibilityReferences(this.database, templateStepIds)
    const referencesByTemplate = new Map<string, typeof references>()
    for (const reference of references) {
      const matches = referencesByTemplate.get(reference.legacyValue) ?? []
      matches.push(reference)
      referencesByTemplate.set(reference.legacyValue, matches)
    }
    const ledgers = await this.database.stepBlockMigrationLedger.findMany({ orderBy: { sourceStepBlockId: 'asc' } })
    const ledgersBySource = new Map(ledgers.map(ledger => [ledger.sourceStepBlockId, ledger]))

    return blocks.map(block => candidateForBlock(block, referencesByTemplate, ledgersBySource.get(block.id)))
  }

  private async applyCandidate(candidate: Candidate): Promise<StepBlockMigrationResult> {
    const current = await this.database.stepBlockMigrationLedger.findUnique({
      where: { sourceStepBlockId: candidate.result.sourceStepBlockId },
    })
    if (current && current.sourceHash === candidate.sourceHash)
      return {
        ...candidate.result,
        classification: current.classification as StepBlockMigrationClassification,
        status: current.status as StepBlockMigrationStatus,
        draftId: current.draftId,
      }

    return this.database.$transaction(async transaction => {
      const existing = await transaction.stepBlockMigrationLedger.findUnique({
        where: { sourceStepBlockId: candidate.result.sourceStepBlockId },
      })
      if (existing) {
        await transaction.stepBlockMigrationLedger.update({
          where: { sourceStepBlockId: existing.sourceStepBlockId },
          data: {
            sourceHash: candidate.sourceHash,
            snapshotJson: candidate.snapshotJson,
            classification: 'source-drift',
            diagnosticsJson: canonicalStepDefinitionJson(candidate.result.diagnostics),
            status: 'source-drift',
          },
        })
        return {
          ...candidate.result,
          classification: 'source-drift' as const,
          status: 'source-drift' as const,
          draftId: existing.draftId,
        }
      }

      let draftId: string | null = null
      if (candidate.draftDefinition && candidate.result.proposedDraft) {
        draftId = randomUUID()
        await transaction.stepDefinitionDraft.create({
          data: {
            id: draftId,
            proposedStepId: candidate.result.proposedDraft.stepId,
            proposedVersion: candidate.result.proposedDraft.version,
            draftJson: canonicalStepDefinitionJson(candidate.draftDefinition),
            draftHash: stepDefinitionContentHash(candidate.draftDefinition),
          },
        })
      }
      await transaction.stepBlockMigrationLedger.create({
        data: {
          sourceStepBlockId: candidate.result.sourceStepBlockId,
          initialSourceHash: candidate.sourceHash,
          initialSnapshotJson: candidate.snapshotJson,
          sourceHash: candidate.sourceHash,
          draftSourceHash: draftId ? candidate.sourceHash : null,
          snapshotJson: candidate.snapshotJson,
          classification: candidate.result.classification,
          diagnosticsJson: canonicalStepDefinitionJson(candidate.result.diagnostics),
          proposedStepId: candidate.result.proposedDraft?.stepId,
          proposedVersion: candidate.result.proposedDraft?.version,
          converterVersion: CONVERTER_VERSION,
          draftId,
          status: candidate.result.status,
          lastAppliedAt: new Date(),
        },
      })
      return { ...candidate.result, draftId }
    })
  }
}
