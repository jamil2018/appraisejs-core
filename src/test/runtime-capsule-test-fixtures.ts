import { createHash } from 'node:crypto'
import {
  builtInStepDefinitions,
  computeStepDefinitionHashes,
  computeStepReferenceHash,
} from '../../packages/cucumber-runtime/src/step-definitions/index.ts'

export const capsuleValidationHash = `sha256:${'a'.repeat(64)}`
export const capsuleCommandBytes = Buffer.from('{}')
export const capsuleCommandHash = `sha256:${createHash('sha256').update(capsuleCommandBytes).digest('hex')}`

/** A real sealed Step Definition closure for repository and lifecycle fixtures. */
export function runtimeCapsuleManifestClosureFixture() {
  const definition = builtInStepDefinitions[0]!
  const hashes = computeStepDefinitionHashes(definition)
  const step = {
    id: definition.identity.id,
    version: definition.identity.version,
    definitionHash: computeStepReferenceHash(definition),
  }
  return {
    rootInvocations: [{ step, inputs: {} }],
    stepDefinitions: [
      {
        step,
        definition,
        definitionHash: hashes.definitionHash,
        humanProjectionHash: hashes.humanProjectionHash,
        agentContractHash: hashes.agentContractHash,
        executionHash: hashes.executionHash,
        publicationReceiptHash: `sha256:${'b'.repeat(64)}`,
      },
    ],
    extensions: [],
  }
}
