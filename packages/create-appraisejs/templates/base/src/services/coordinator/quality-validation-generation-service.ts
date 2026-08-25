import { createHash } from 'node:crypto'

import { canonicalContractJson } from '@/lib/catalog-contracts'
import { hashCanonical } from '@/lib/quality-design/state'

const digest = (value: unknown) => `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`

export type QualityValidationGenerationIdentityInput = {
  targetProjectId: string
  qualityPlanRevisionId: string
  validationVersionId: string
  validationHash: string
  artifactSchemaVersion: string
  preflightAlgorithmVersion: string
  preflightAuthority: string
  scopeIntentHash: string
  realizationIntentHash: string
  preflightHash: string
  canonicalRealizationJson: string
  realizationHash: string
  compilationHash: string
  assuranceLevel: string
}

export function qualityValidationGenerationIdentity(input: QualityValidationGenerationIdentityInput) {
  const generationKey = hashCanonical({
    domain: 'appraise.quality-validation-generation/v3',
    targetProjectId: input.targetProjectId,
    qualityPlanRevisionId: input.qualityPlanRevisionId,
    validationVersionId: input.validationVersionId,
    validationHash: input.validationHash,
    artifactSchemaVersion: input.artifactSchemaVersion,
    preflightAlgorithmVersion: input.preflightAlgorithmVersion,
    preflightAuthority: input.preflightAuthority,
    scopeIntentHash: input.scopeIntentHash,
    realizationIntentHash: input.realizationIntentHash,
    preflightHash: input.preflightHash,
    canonicalRealizationJson: input.canonicalRealizationJson,
    realizationHash: input.realizationHash,
    compilationHash: input.compilationHash,
    assuranceLevel: input.assuranceLevel,
  })
  return { id: `qvg_${generationKey.slice('sha256:'.length)}`, generationKey }
}

export function qualityValidationPublicationOperationIdentity(input: {
  generationId: string
  immutablePublication: unknown
  extensionArtifactHashes: string[]
}) {
  const operationHash = hashCanonical({
    domain: 'appraise.quality-validation-publication/v3',
    generationId: input.generationId,
    immutablePublication: input.immutablePublication,
    extensionArtifactHashes: [...input.extensionArtifactHashes].sort(),
  })
  return { id: `qvp_${operationHash.slice('sha256:'.length)}`, operationHash }
}

export function qualityValidationPublicationCommandRequestHash(input: {
  targetProjectId: string
  qualityPlanRevisionId: string
  validationVersionId: string
  generationKey: string
  operationHash: string
}) {
  return digest({ domain: 'appraise.quality-validation-publication-command/v1', ...input })
}
