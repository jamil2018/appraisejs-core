import { describe, expect, it } from 'vitest'

import {
  qualityValidationGenerationIdentity,
  qualityValidationPublicationCommandRequestHash,
  qualityValidationPublicationOperationIdentity,
} from './quality-validation-generation-service'

const generationInput = {
  targetProjectId: 'target-1',
  qualityPlanRevisionId: 'revision-1',
  validationVersionId: 'validation-1',
  validationHash: 'sha256:validation',
  artifactSchemaVersion: 'appraise.quality-validation-generation/v3',
  preflightAlgorithmVersion: 'appraise.quality-assessment-preflight/v2',
  preflightAuthority: 'appraisejs:quality-validation-publication:v2',
  scopeIntentHash: 'sha256:scope',
  realizationIntentHash: 'sha256:intent',
  preflightHash: 'sha256:preflight',
  canonicalRealizationJson: '{"runtime":true}',
  realizationHash: 'sha256:realization',
  compilationHash: 'sha256:compilation',
  assuranceLevel: 'STANDARD',
}

describe('quality validation generation identity', () => {
  it('is deterministic without caller command identity and domain separates publication identity', () => {
    const first = qualityValidationGenerationIdentity(generationInput)
    const second = qualityValidationGenerationIdentity({ ...generationInput })
    expect(second).toEqual(first)

    const operation = qualityValidationPublicationOperationIdentity({
      generationId: first.id,
      immutablePublication: { runtimeInputHash: 'sha256:runtime', reviewHash: 'sha256:review' },
      extensionArtifactHashes: ['sha256:b', 'sha256:a'],
    })
    expect(
      qualityValidationPublicationOperationIdentity({
        generationId: first.id,
        immutablePublication: { runtimeInputHash: 'sha256:runtime', reviewHash: 'sha256:review' },
        extensionArtifactHashes: ['sha256:a', 'sha256:b'],
      }),
    ).toEqual(operation)
    expect(operation.id).not.toBe(first.id)
  })

  it('binds command replay to the immutable generation and publication, not the caller key', () => {
    const generation = qualityValidationGenerationIdentity(generationInput)
    const request = {
      targetProjectId: generationInput.targetProjectId,
      qualityPlanRevisionId: generationInput.qualityPlanRevisionId,
      validationVersionId: generationInput.validationVersionId,
      generationKey: generation.generationKey,
      operationHash: 'sha256:operation',
    }
    expect(qualityValidationPublicationCommandRequestHash(request)).toBe(
      qualityValidationPublicationCommandRequestHash({ ...request }),
    )
    expect(qualityValidationPublicationCommandRequestHash({ ...request, operationHash: 'sha256:other' })).not.toBe(
      qualityValidationPublicationCommandRequestHash(request),
    )
  })
})
