import { z } from 'zod'

import { canonicalContractJson } from '@/lib/catalog-contracts/canonical-json'
import { sharedSourceDigest } from './shared-resource-contract'
import { automationScenarioMaterializationSchema, hashAutomationMaterialization } from './automation-contracts'
import { qualityJourneyContractVersion, qualityJourneyIdentifierSchema } from './contracts'

export const M06_MATERIALIZATION_ARTIFACT_VERSION = 'M06_MATERIALIZATION_ARTIFACT_V1' as const
const id = qualityJourneyIdentifierSchema
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const sourceId = z.string().regex(/^[\x20-\x7e]{1,128}$/)
const proposalStep = automationScenarioMaterializationSchema.shape.steps.element
const artifactStep = proposalStep.omit({ sourceScenarioStepId: true, stepDefinition: true })
  .extend({ stepId: id, definition: proposalStep.shape.stepDefinition }).strict()
const artifactManifest = z.object({
  schemaVersion: z.literal(qualityJourneyContractVersion),
  kind: z.literal('PREPARED_RUNTIME_CAPSULE'),
  materializationId: sourceId,
  sourceScenarioRevisionId: id,
  sourceScenarioContentHash: digest,
  suiteId: id,
  testCaseId: id,
  steps: z.array(artifactStep).min(1).max(128),
  dataRequirements: z.array(proposalStep.shape.testData.element).max(16_384),
  locatorRequirements: z.array(proposalStep.shape.locatorRequirements.element).max(16_384),
  decision: z.object({ id, contentHash: digest }).strict(),
  portfolioRevisionId: id,
  portfolioHash: digest,
}).strict()
const materialization = z.object({
  id: sourceId, journeyId: id, targetProjectId: id, cycleId: id,
  scenarioRevisionId: id, scenarioContentHash: digest,
  portfolioRevisionId: id, portfolioContentHash: digest,
  decisionId: id, decisionHash: digest,
  workItemId: id, attemptId: id, leaseId: id,
  inputHash: digest, materializationHash: digest,
  status: z.literal('MATERIALIZED'),
  sourceProofVersion: z.literal(M06_MATERIALIZATION_ARTIFACT_VERSION),
  suiteId: id, testCaseId: id, artifactRecordId: id, artifactJson: z.string(),
}).passthrough()
const proof = z.object({
  materializationId: sourceId,
  expectedScopeHash: digest,
  reconstructionVersion: z.literal(M06_MATERIALIZATION_ARTIFACT_VERSION),
}).passthrough()
const linkedArtifact = z.object({
  id, journeyId: id, targetProjectId: id, cycleId: id,
  kind: z.literal('RUNTIME_CAPSULE'), artifactId: sourceId,
  contentHash: digest, artifactJson: z.string(),
}).passthrough()
const association = z.object({ materializationId: sourceId, bindingId: id }).passthrough()
const targetBinding = z.object({ id, targetProjectId: id, suiteId: id, testCaseId: id }).passthrough()

export class MaterializationSourceContractError extends Error {
  constructor(readonly reason: string) {
    super(`Materialization source refused: ${reason}`)
    this.name = 'MaterializationSourceContractError'
  }
}
const refuse: (reason: string) => never = reason => { throw new MaterializationSourceContractError(reason) }

function boundedJson(raw: string): unknown {
  if (Buffer.byteLength(raw, 'utf8') > 1_048_576) refuse('ARTIFACT_BYTES')
  let value: unknown
  try { value = JSON.parse(raw) } catch { return refuse('ARTIFACT_JSON') }
  let nodes = 0
  const visit = (node: unknown, depth: number): void => {
    if (++nodes > 65_536 || depth > 32) refuse('ARTIFACT_DEPTH')
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1)
    } else if (node && typeof node === 'object') {
      for (const item of Object.values(node)) visit(item, depth + 1)
    }
  }
  visit(value, 0)
  return value
}

/**
 * Pure verification of full, unfiltered acquisition reads. Callers must read materialization,
 * sidecar, linked artifact, and every materialization/binding association in one owning transaction.
 * The returned digest is inert source identity, never a Use, grant, or producer capability.
 */
export function reconstructMaterializationSource(input: Readonly<{
  materialization: unknown
  proof: unknown
  artifact: unknown
  materializationBindings: readonly unknown[]
  targetBindings: readonly unknown[]
}>) {
  const row = materialization.safeParse(input.materialization)
  const sourceProof = proof.safeParse(input.proof)
  const artifact = linkedArtifact.safeParse(input.artifact)
  if (!row.success || !sourceProof.success || !artifact.success) refuse('ROW_OR_PROOF_SHAPE')
  const receipt = row.data
  const retained = sourceProof.data
  const linked = artifact.data
  if (retained.materializationId !== receipt.id || linked.id !== receipt.artifactRecordId ||
    linked.artifactId !== receipt.id || linked.journeyId !== receipt.journeyId ||
    linked.targetProjectId !== receipt.targetProjectId || linked.cycleId !== receipt.cycleId ||
    receipt.artifactJson !== linked.artifactJson) refuse('LINKED_IDENTITY')
  if (input.materializationBindings.length !== 1 || input.targetBindings.length !== 1)
    refuse('BINDING_CARDINALITY')
  const associationRow = association.safeParse(input.materializationBindings[0])
  const bindingRow = targetBinding.safeParse(input.targetBindings[0])
  if (!associationRow.success || !bindingRow.success ||
    associationRow.data.materializationId !== receipt.id ||
    associationRow.data.bindingId !== bindingRow.data.id ||
    bindingRow.data.targetProjectId !== receipt.targetProjectId ||
    bindingRow.data.suiteId !== receipt.suiteId || bindingRow.data.testCaseId !== receipt.testCaseId)
    refuse('BINDING_IDENTITY')
  const parsed = boundedJson(receipt.artifactJson)
  const manifest = artifactManifest.safeParse(parsed)
  if (!manifest.success) refuse('ARTIFACT_SHAPE')
  if (canonicalContractJson(parsed) !== receipt.artifactJson ||
    hashAutomationMaterialization(parsed) !== linked.contentHash)
    refuse('ARTIFACT_CANONICAL_HASH')
  const artifactValue = manifest.data
  if (artifactValue.materializationId !== receipt.id ||
    artifactValue.sourceScenarioRevisionId !== receipt.scenarioRevisionId ||
    artifactValue.sourceScenarioContentHash !== receipt.scenarioContentHash ||
    artifactValue.suiteId !== receipt.suiteId || artifactValue.testCaseId !== receipt.testCaseId ||
    artifactValue.portfolioRevisionId !== receipt.portfolioRevisionId ||
    artifactValue.portfolioHash !== receipt.portfolioContentHash ||
    artifactValue.decision.id !== receipt.decisionId ||
    artifactValue.decision.contentHash !== receipt.decisionHash)
    refuse('ARTIFACT_LINEAGE')
  if (canonicalContractJson(artifactValue.dataRequirements) !==
      canonicalContractJson(artifactValue.steps.flatMap(step => step.testData)) ||
    canonicalContractJson(artifactValue.locatorRequirements) !==
      canonicalContractJson(artifactValue.steps.flatMap(step => step.locatorRequirements)))
    refuse('REQUIREMENTS_MAPPING')
  const proposal = automationScenarioMaterializationSchema.parse({
    scenarioRevisionId: artifactValue.sourceScenarioRevisionId,
    steps: artifactValue.steps.map(step => ({
      sourceScenarioStepId: step.stepId,
      stepDefinition: step.definition,
      operation: step.operation,
      parameters: step.parameters,
      testData: step.testData,
      locatorRequirements: step.locatorRequirements,
    })),
  })
  const recalculated = hashAutomationMaterialization({
    journeyId: receipt.journeyId,
    targetProjectId: receipt.targetProjectId,
    expectedInputHash: receipt.inputHash,
    expectedScopeHash: retained.expectedScopeHash,
    workItemId: receipt.workItemId,
    attemptId: receipt.attemptId,
    leaseId: receipt.leaseId,
    scenario: proposal,
  })
  if (recalculated !== receipt.materializationHash) refuse('MATERIALIZATION_HASH')
  return Object.freeze({
    sourceKind: 'AUTOMATION_MATERIALIZATION' as const,
    sourceOwnerId: receipt.id,
    sourceHash: receipt.materializationHash,
    sourceDigest: sharedSourceDigest({ sourceKind: 'AUTOMATION_MATERIALIZATION',
      sourceOwnerId: receipt.id, sourceHash: receipt.materializationHash }),
    proposal,
  })
}
