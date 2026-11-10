import { describe, expect, it } from 'vitest'

import { canonicalContractJson } from '@/lib/catalog-contracts/canonical-json'
import { automationScenarioMaterializationSchema, hashAutomationMaterialization } from './automation-contracts'
import { sharedSourceDigest } from './shared-resource-contract'
import {
  M06_MATERIALIZATION_ARTIFACT_VERSION,
  reconstructMaterializationSource,
} from './materialization-source-contract'

const H = (character: string) => `sha256:${character.repeat(64)}`
function fixture() {
  const proposal = automationScenarioMaterializationSchema.parse({
    scenarioRevisionId: 'scenario-revision',
    steps: [
      { sourceScenarioStepId: 'step-one',
        stepDefinition: { id: 'definition-one', version: 'v1', definitionHash: H('a') },
        operation: { id: 'operation-one', version: 'v1', handler: {
          id: 'handler-one', version: 'v1', contentHash: H('b') } },
        parameters: [{ name: 'input', type: 'json', value: { nested: [2, 'x'] } }],
        testData: [{ key: 'seed', type: 'json', value: { active: true } }],
        locatorRequirements: [{ requirementId: 'requirement-one',
          parameterName: 'locator', locatorId: 'locator-one' }],
      },
      { sourceScenarioStepId: 'step-two',
        stepDefinition: { id: 'definition-two', version: 'v2', definitionHash: H('c') },
        operation: { id: 'operation-two', version: 'v2', handler: {
          id: 'handler-two', version: 'v2', contentHash: H('d') } },
        parameters: [{ name: 'count', type: 'number', value: 3 }],
        testData: [{ key: 'sample', type: 'text', value: 'later' }],
        locatorRequirements: [{ requirementId: 'requirement-two',
          parameterName: 'runtimeLocator', runtimeParameter: true }],
      },
    ],
  })
  const manifest = {
    schemaVersion: 'appraise.quality-journey/v1', kind: 'PREPARED_RUNTIME_CAPSULE',
    materializationId: 'materialization', sourceScenarioRevisionId: proposal.scenarioRevisionId,
    sourceScenarioContentHash: H('e'), suiteId: 'suite', testCaseId: 'case',
    steps: proposal.steps.map(step => ({ stepId: step.sourceScenarioStepId,
      definition: step.stepDefinition, operation: step.operation, parameters: step.parameters,
      testData: step.testData, locatorRequirements: step.locatorRequirements })),
    dataRequirements: proposal.steps.flatMap(step => step.testData),
    locatorRequirements: proposal.steps.flatMap(step => step.locatorRequirements),
    decision: { id: 'decision', contentHash: H('f') },
    portfolioRevisionId: 'portfolio-revision', portfolioHash: H('1'),
  }
  const artifactJson = canonicalContractJson(manifest)
  const row = {
    id: 'materialization', journeyId: 'journey', targetProjectId: 'target', cycleId: 'cycle',
    scenarioRevisionId: 'scenario-revision', scenarioContentHash: H('e'),
    portfolioRevisionId: 'portfolio-revision', portfolioContentHash: H('1'),
    decisionId: 'decision', decisionHash: H('f'), workItemId: 'work', attemptId: 'attempt',
    leaseId: 'lease', inputHash: H('2'),
    materializationHash: hashAutomationMaterialization({ journeyId: 'journey',
      targetProjectId: 'target', expectedInputHash: H('2'), expectedScopeHash: H('3'),
      workItemId: 'work', attemptId: 'attempt', leaseId: 'lease', scenario: proposal }),
    status: 'MATERIALIZED', sourceProofVersion: M06_MATERIALIZATION_ARTIFACT_VERSION,
    suiteId: 'suite', testCaseId: 'case', artifactRecordId: 'artifact', artifactJson,
  }
  return {
    materialization: row,
    proof: { materializationId: row.id, expectedScopeHash: H('3'),
      reconstructionVersion: M06_MATERIALIZATION_ARTIFACT_VERSION },
    artifact: { id: 'artifact', journeyId: 'journey', targetProjectId: 'target',
      cycleId: 'cycle', kind: 'RUNTIME_CAPSULE', artifactId: row.id,
      contentHash: hashAutomationMaterialization(manifest), artifactJson },
    materializationBindings: [{ materializationId: row.id, bindingId: 'binding' }],
    targetBindings: [{ id: 'binding', journeyId: 'other-creator', targetProjectId: 'target',
      suiteId: 'suite', testCaseId: 'case' }],
    proposal,
  }
}

function rewriteArtifact(value: ReturnType<typeof fixture>, manifest: Record<string, unknown>) {
  const artifactJson = canonicalContractJson(manifest)
  value.materialization.artifactJson = artifactJson
  value.artifact.artifactJson = artifactJson
  value.artifact.contentHash = hashAutomationMaterialization(manifest)
}

describe('M06 materialization source reconstruction', () => {
  it('recovers the ordered proposal and exact prefixed source-hash representation', () => {
    const value = fixture()
    const writerManifest = JSON.parse(value.artifact.artifactJson) as {
      steps: Record<string, unknown>[]
    }
    expect(writerManifest.steps[0]).toHaveProperty('definition', value.proposal.steps[0]!.stepDefinition)
    expect(writerManifest.steps[0]).not.toHaveProperty('stepDefinition')
    const source = reconstructMaterializationSource(value)
    expect(source.proposal).toEqual(value.proposal)
    expect(source.sourceHash).toBe(value.materialization.materializationHash)
    expect(source.sourceHash.startsWith('sha256:')).toBe(true)
    expect(source.sourceDigest).toBe(sharedSourceDigest({
      sourceKind: 'AUTOMATION_MATERIALIZATION', sourceOwnerId: 'materialization',
      sourceHash: value.materialization.materializationHash,
    }))
  })

  it('refuses changed scope, lineage and artifact digest despite a retained success marker', () => {
    const changedScope = fixture()
    changedScope.proof.expectedScopeHash = H('4')
    expect(() => reconstructMaterializationSource(changedScope)).toThrow(/MATERIALIZATION_HASH/)
    const changedLineage = fixture()
    changedLineage.materialization.scenarioContentHash = H('4')
    expect(() => reconstructMaterializationSource(changedLineage)).toThrow(/ARTIFACT_LINEAGE/)
    const changedArtifact = fixture()
    changedArtifact.artifact.contentHash = H('4')
    expect(() => reconstructMaterializationSource(changedArtifact)).toThrow(/ARTIFACT_CANONICAL_HASH/)
  })

  it('refuses reordered, omitted or extra mapped step content even with a rehashed artifact', () => {
    const reordered = fixture()
    const reorderedManifest = JSON.parse(reordered.artifact.artifactJson) as Record<string, unknown>
    const reorderedSteps = [...(reorderedManifest.steps as unknown[])]
    reorderedManifest.steps = [reorderedSteps[1], reorderedSteps[0]]
    reorderedManifest.dataRequirements = [...(reorderedManifest.dataRequirements as unknown[])].reverse()
    reorderedManifest.locatorRequirements = [...(reorderedManifest.locatorRequirements as unknown[])].reverse()
    rewriteArtifact(reordered, reorderedManifest)
    expect(() => reconstructMaterializationSource(reordered)).toThrow(/MATERIALIZATION_HASH/)

    const omitted = fixture()
    const omittedManifest = JSON.parse(omitted.artifact.artifactJson) as Record<string, unknown>
    omittedManifest.steps = (omittedManifest.steps as unknown[]).slice(0, 1)
    omittedManifest.dataRequirements = (omittedManifest.dataRequirements as unknown[]).slice(0, 1)
    omittedManifest.locatorRequirements = (omittedManifest.locatorRequirements as unknown[]).slice(0, 1)
    rewriteArtifact(omitted, omittedManifest)
    expect(() => reconstructMaterializationSource(omitted)).toThrow(/MATERIALIZATION_HASH/)

    const extra = fixture()
    const extraManifest = JSON.parse(extra.artifact.artifactJson) as Record<string, unknown>
    ;(extraManifest.steps as Record<string, unknown>[])[0]!.extra = 'unapproved'
    rewriteArtifact(extra, extraManifest)
    expect(() => reconstructMaterializationSource(extra)).toThrow(/ARTIFACT_SHAPE/)

    const wrongStepShape = fixture()
    const wrongStepManifest = JSON.parse(wrongStepShape.artifact.artifactJson) as Record<string, unknown>
    const wrongStep = (wrongStepManifest.steps as Record<string, unknown>[])[0]!
    wrongStep.stepDefinition = wrongStep.definition
    delete wrongStep.definition
    rewriteArtifact(wrongStepShape, wrongStepManifest)
    expect(() => reconstructMaterializationSource(wrongStepShape)).toThrow(/ARTIFACT_SHAPE/)
  })

  it('refuses failed, missing-sidecar, duplicate and foreign association inputs', () => {
    const failed = fixture()
    failed.materialization.status = 'FAILED'
    expect(() => reconstructMaterializationSource(failed)).toThrow(/ROW_OR_PROOF_SHAPE/)
    const missing = fixture()
    expect(() => reconstructMaterializationSource({ ...missing, proof: null }))
      .toThrow(/ROW_OR_PROOF_SHAPE/)
    const duplicate = fixture()
    duplicate.materializationBindings.push({ materializationId: 'materialization', bindingId: 'binding' })
    expect(() => reconstructMaterializationSource(duplicate)).toThrow(/BINDING_CARDINALITY/)
    const foreign = fixture()
    foreign.materializationBindings[0]!.materializationId = 'foreign'
    expect(() => reconstructMaterializationSource(foreign)).toThrow(/BINDING_IDENTITY/)
  })
})
