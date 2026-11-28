import { z } from 'zod'
import {
  qualityJourneyContractVersion,
  resourceResolutionBundleSchema,
  targetObservationBundleSchema,
} from '@/lib/quality-journey'
import type { prepareAppManagedDiscoveryTask } from './app-managed-discovery-task'
import type { ManagedDiscoveryRole } from './app-managed-discovery-contract'
import type { readInternalScoutEvidence } from './quality-journey-discovery-browser-service'
import { builtInStepDefinitions } from '../../../packages/cucumber-runtime/src/step-definitions'
import { computeStepDefinitionHashes } from '../../../packages/cucumber-runtime/src/step-definitions/contracts'
import { defaultOperationDefinitions } from '@/lib/operation-catalog'
import { hashAutomationMaterialization } from '@/lib/quality-journey/automation-contracts'
import { reviewedScoutSnapshot } from '@/lib/quality-journey/managed-scout-snapshot'

type DiscoveryTask = Awaited<ReturnType<typeof prepareAppManagedDiscoveryTask>>
type ScoutData = {
  evidence: Awaited<ReturnType<typeof readInternalScoutEvidence>>
  reviewedPageSet: boolean
}

/** Fact indices stay stable across prompting, validation and restart. */
export function indexAppManagedScoutFacts(data: ScoutData) {
  let nextIndex = 0
  return (data.reviewedPageSet ? data.evidence : data.evidence.slice(0, 1)).map(page => ({
    page,
    facts: page.facts.map(fact => ({ factIndex: nextIndex++, fact })),
  }))
}

/** Freeze the executable dependency of a selected built-in before any Automator work is issued. */
export function pinnedDiscoveryOperation(resourceId: string, resources: Array<{ id: string; contentHash: string }>) {
  const definition = builtInStepDefinitions.find(
    row => resourceId === `step:${row.identity.id}:${row.identity.version}`,
  )
  if (!definition || definition.identity.status !== 'ready' || definition.execution.kind !== 'operation') return null
  if (
    resources.find(row => row.id === resourceId)?.contentHash !== computeStepDefinitionHashes(definition).definitionHash
  )
    throw new Error('Selected Step Definition differs from the frozen READY source.')
  const execution = definition.execution
  const operation = defaultOperationDefinitions.find(
    row =>
      row.id === definition.identity.id &&
      row.version === definition.identity.version &&
      row.handler.id === execution.handlerId &&
      row.handler.version === execution.handlerVersion,
  )
  if (!operation) throw new Error('Selected Step Definition has no exact pinned canonical operation.')
  const id = `operation:${operation.id}:${operation.version}`
  if (resources.find(row => row.id === id)?.contentHash !== hashAutomationMaterialization(operation))
    throw new Error('Pinned canonical operation differs from the frozen Discovery resource.')
  return id
}

const index = z.number().int().nonnegative()
const rationale = z.string().trim().min(1).max(8000)
const scoutSelection = z.object({ factIndexes: z.array(index).min(1).max(512) }).strict()
const resourceSelection = z
  .object({
    destinationResourceIndex: index,
    classifications: z
      .array(
        z
          .object({
            resourceIndex: index,
            requirementIndex: index,
            classification: z.enum(['COMPATIBLE', 'INCOMPATIBLE', 'STALE', 'CROSS_TARGET']),
            rationale,
          })
          .strict(),
      )
      .max(512),
    missing: z.array(z.object({ requirementIndex: index, rationale }).strict()).max(512),
  })
  .strict()

/** Simple closed JSON schema for native structured output: no references or principal fields. */
export function managedDiscoveryNativeOutputSchema(role: ManagedDiscoveryRole) {
  const integer = { type: 'integer' }
  const string = { type: 'string' }
  const object = (properties: Record<string, unknown>) => ({
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  })
  return role === 'SCOUT'
    ? object({ factIndexes: { type: 'array', items: integer } })
    : object({
        destinationResourceIndex: integer,
        classifications: {
          type: 'array',
          items: object({
            resourceIndex: integer,
            requirementIndex: integer,
            classification: { type: 'string', enum: ['COMPATIBLE', 'INCOMPATIBLE', 'STALE', 'CROSS_TARGET'] },
            rationale: string,
          }),
        },
        missing: { type: 'array', items: object({ requirementIndex: integer, rationale: string }) },
      })
}

/** Model chooses only bounded public indices; Appraise supplies every canonical identity, fact and evidence reference. */
export function projectAppManagedDiscoverySelection(task: DiscoveryTask, value: unknown) {
  const data = task.data
  const common = {
    cycleId: data.cycleId,
    analysisRevision: data.analysisRevision,
    analysisApproval: data.analysisApproval,
    approvedRequirementSetHash: data.approvedRequirementSetHash,
    inputArtifacts: data.inputArtifacts,
  }
  const args = { discoveryRevisionId: task.discoveryRevisionId, idempotencyKey: task.submissionIdempotencyKey }
  let bundle: Record<string, unknown>
  if (task.binding.role === 'SCOUT') {
    const selection = scoutSelection.parse(value)
    if (!('evidence' in data) || !data.evidence[0]) throw new Error('No selected captured snapshot.')
    const pages = indexAppManagedScoutFacts(data)
    const facts = pages.flatMap(({ page, facts }) => facts.map(({ fact }) => ({ page, fact })))
    const targetSnapshot = reviewedScoutSnapshot(pages.map(({ page }) => page))
    if (new Set(selection.factIndexes).size !== selection.factIndexes.length)
      throw new Error('Duplicate captured fact selection.')
    const observations = [...selection.factIndexes]
      .sort((a, b) => a - b)
      .map((factIndex, ordinal) => {
        const captured = facts[factIndex]
        if (!captured) throw new Error('Captured fact index is outside the selected snapshot.')
        const { page, fact } = captured
        return {
          observationId: `app-scout-${ordinal.toString().padStart(4, '0')}`,
          snapshotId: page.snapshotId,
          routeId: page.routeId,
          environmentId: page.environmentId,
          fact,
          evidenceReceiptIds: [page.artifactId],
          confidence: 'HIGH',
          confidenceRationale: 'Exact fact captured by the scoped Appraise Discovery browser.',
          stability: 'CONDITIONAL',
          stabilityRationale: 'This fact describes the captured target snapshot and may change with the target.',
          revalidationPolicy: { triggers: ['target_changed'] },
        }
      })
    if (new Set(observations.flatMap(observation => observation.evidenceReceiptIds)).size !== pages.length)
      throw new Error('Select at least one captured fact from every reviewed page.')
    bundle = {
      ...common,
      bundleId: `app-scout:${task.binding.attemptId}`,
      observedAt: targetSnapshot.capturedAt,
      targetSnapshot,
      evidenceReceipts: pages.map(({ page: { artifactId, contentHash } }) => ({ artifactId, contentHash })),
      observations,
    }
  } else {
    const selection = resourceSelection.parse(value)
    if (!('resources' in data.scope)) throw new Error('No frozen resource inventory.')
    const resources = data.scope.resources
    const requirements = [...(data.analysisCharter.requirements as Array<{ requirementId: string }>)].sort((a, b) =>
      a.requirementId < b.requirementId ? -1 : a.requirementId > b.requirementId ? 1 : 0,
    )
    const destination = resources[selection.destinationResourceIndex]
    if (
      !destination ||
      destination.kind !== 'MODULE' ||
      destination.sourceTargetProjectId !== task.binding.targetProjectId
    )
      throw new Error('Destination index is outside the frozen target modules.')
    const evidenceReceipts = data.inputArtifacts
      .map(ref => ({ artifactId: ref.artifactId, contentHash: ref.contentHash }))
      .sort((a, b) => (a.artifactId < b.artifactId ? -1 : a.artifactId > b.artifactId ? 1 : 0))
    const evidenceReceiptIds = evidenceReceipts.map(ref => ref.artifactId)
    const seen = new Set<string>()
    const ranks = new Map<string, number>()
    const categories: Record<string, Array<Record<string, unknown>>> = {
      reusable: [],
      incompatible: [],
      stale: [],
      crossTarget: [],
    }
    const categoryNames = {
      COMPATIBLE: 'reusable',
      INCOMPATIBLE: 'incompatible',
      STALE: 'stale',
      CROSS_TARGET: 'crossTarget',
    }
    for (const choice of selection.classifications) {
      const resource = resources[choice.resourceIndex],
        requirement = requirements[choice.requirementIndex]
      if (!resource || !requirement) throw new Error('Resource or requirement index is outside the exact assignment.')
      const identity = `${requirement.requirementId}:${resource.id}`
      if (seen.has(identity)) throw new Error('Duplicate resource classification.')
      seen.add(identity)
      const rank = (ranks.get(requirement.requirementId) ?? 0) + 1
      ranks.set(requirement.requirementId, rank)
      if (
        choice.classification === 'CROSS_TARGET' &&
        (!resource.sourceTargetProjectId || resource.sourceTargetProjectId === task.binding.targetProjectId)
      )
        throw new Error('Cross-target choice does not match frozen ownership.')
      categories[categoryNames[choice.classification]].push({
        resourceId: resource.id,
        resourceKind: resource.kind,
        requirementId: requirement.requirementId,
        rank,
        explanation: choice.rationale,
        reasonCode: choice.classification,
        evidenceReceiptIds,
        ...(choice.classification === 'CROSS_TARGET' ? { sourceTargetProjectId: resource.sourceTargetProjectId } : {}),
      })
    }
    for (const selected of [...categories.reusable]) {
      if (selected.resourceKind !== 'STEP_DEFINITION') continue
      const operationId = pinnedDiscoveryOperation(String(selected.resourceId), resources)
      if (!operationId) continue
      const classified = Object.entries(categories).flatMap(([category, rows]) =>
        rows
          .filter(row => row.resourceId === operationId && row.requirementId === selected.requirementId)
          .map(row => ({ category, row })),
      )
      if (classified.some(row => row.category !== 'reusable'))
        throw new Error('Selected READY step conflicts with its pinned operation classification.')
      if (classified.length) continue
      const requirementId = String(selected.requirementId)
      const rank = (ranks.get(requirementId) ?? 0) + 1
      ranks.set(requirementId, rank)
      categories.reusable.push({
        resourceId: operationId,
        resourceKind: 'OPERATION',
        requirementId,
        rank,
        explanation: `Canonical executable dependency pinned by selected READY ${String(selected.resourceId)}; exact definition and operation hashes match the frozen Discovery inventory.`,
        reasonCode: 'COMPATIBLE',
        evidenceReceiptIds,
      })
    }
    for (const entries of Object.values(categories))
      entries.sort((a, b) =>
        String(a.requirementId) < String(b.requirementId)
          ? -1
          : String(a.requirementId) > String(b.requirementId)
            ? 1
            : Number(a.rank) - Number(b.rank),
      )
    const missing = selection.missing
      .map((choice, ordinal) => {
        const requirement = requirements[choice.requirementIndex]
        if (!requirement) throw new Error('Missing-capability requirement is outside the exact assignment.')
        return {
          requirementId: requirement.requirementId,
          capabilityId: `missing-${ordinal.toString().padStart(4, '0')}`,
          reasonCode: 'CAPABILITY_GAP',
          explanation: choice.rationale,
          evidenceReceiptIds,
        }
      })
      .sort((a, b) =>
        a.requirementId < b.requirementId
          ? -1
          : a.requirementId > b.requirementId
            ? 1
            : a.capabilityId < b.capabilityId
              ? -1
              : 1,
      )
    bundle = {
      ...common,
      bundleId: `app-resources:${task.binding.attemptId}`,
      resolvedAt: new Date().toISOString(),
      destinationModuleId: destination.id.slice('module:'.length),
      approvedRequirementIds: requirements.map(requirement => requirement.requirementId),
      evidenceReceipts,
      ...categories,
      missing,
    }
  }
  const trusted = {
    ...bundle,
    schemaVersion: qualityJourneyContractVersion,
    journeyId: task.binding.journeyId,
    targetProjectId: task.binding.targetProjectId,
    workItemId: task.binding.workItemId,
    attemptId: task.binding.attemptId,
    ...task.authority,
  }
  if (task.binding.role === 'SCOUT') targetObservationBundleSchema.parse(trusted)
  else resourceResolutionBundleSchema.parse(trusted)
  return { toolName: task.submitTool, arguments: { ...args, bundle }, callId: task.submissionIdempotencyKey }
}
