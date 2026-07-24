import {
  computeStepDefinitionHashes,
  computeStepReferenceHash,
  stepDefinitionSchema,
  stepReferenceSchema,
  type StepDefinition,
  type StepInvocation,
} from '../../../packages/cucumber-runtime/src/step-definitions/contracts.ts'

type ExactStepReference = StepInvocation['step']

export type RuntimeStepDefinitionRecord = {
  status: string
  definitionJson: string
  definitionHash: string
  humanProjectionHash: string | null
  agentContractHash: string | null
  executionHash: string | null
  publicationReceipt: { receiptHash: string } | null
}

export type SealedRuntimeStepDefinition = {
  step: ExactStepReference
  definition: StepDefinition
  hashes: {
    definition: string
    humanProjection: string
    agentContract: string
    execution: string
    publicationReceipt: string
  }
}

function assertPersistedIdentity(step: ExactStepReference, definition: StepDefinition) {
  const identity = definition.identity
  if (identity.id !== step.id || identity.version !== step.version || identity.status !== 'ready')
    throw new Error(`Runtime Step Definition ${step.id}@${step.version} has conflicting persisted identity.`)
}

function assertPersistedHashes(step: ExactStepReference, row: RuntimeStepDefinitionRecord, definition: StepDefinition) {
  if (computeStepReferenceHash(definition) !== step.definitionHash)
    throw new Error(`Runtime Step Definition ${step.id}@${step.version} does not match its exact reference hash.`)
  const expected = computeStepDefinitionHashes(definition)
  const actual = [row.definitionHash, row.humanProjectionHash, row.agentContractHash, row.executionHash]
  const hashes = [
    expected.definitionHash,
    expected.humanProjectionHash,
    expected.agentContractHash,
    expected.executionHash,
  ]
  if (actual.some((value, index) => value !== hashes[index]))
    throw new Error(`Runtime Step Definition ${step.id}@${step.version} has conflicting publication hashes.`)
}

function sealedDefinition(step: ExactStepReference, row: RuntimeStepDefinitionRecord): SealedRuntimeStepDefinition {
  if (row.status !== 'ready') throw new Error(`Runtime Step Definition ${step.id}@${step.version} is not ready.`)
  const definition = stepDefinitionSchema.parse(JSON.parse(row.definitionJson))
  assertPersistedIdentity(step, definition)
  assertPersistedHashes(step, row, definition)
  if (!row.publicationReceipt?.receiptHash)
    throw new Error(`Runtime Step Definition ${step.id}@${step.version} is missing publication evidence.`)
  return {
    step,
    definition,
    hashes: {
      definition: row.definitionHash,
      humanProjection: row.humanProjectionHash,
      agentContract: row.agentContractHash,
      execution: row.executionHash,
      publicationReceipt: row.publicationReceipt.receiptHash,
    },
  }
}

export async function resolveRuntimeStepDefinitionClosure(
  roots: ExactStepReference[],
  read: (step: ExactStepReference) => Promise<RuntimeStepDefinitionRecord | null>,
): Promise<SealedRuntimeStepDefinition[]> {
  const resolved = new Map<string, SealedRuntimeStepDefinition>()
  const visiting = new Set<string>()

  const visit = async (unparsed: ExactStepReference): Promise<void> => {
    const step = stepReferenceSchema.parse(unparsed)
    const key = `${step.id}@${step.version}#${step.definitionHash}`
    if (resolved.has(key)) return
    if (visiting.has(key))
      throw new Error(`Runtime Step Definition closure contains a cycle at ${step.id}@${step.version}.`)
    visiting.add(key)
    try {
      const row = await read(step)
      if (!row) throw new Error(`Runtime Step Definition ${step.id}@${step.version} is not ready.`)
      const sealed = sealedDefinition(step, row)
      const { definition } = sealed
      if (definition.execution.kind === 'composition')
        for (const child of definition.execution.steps) await visit(child.step)
      resolved.set(key, sealed)
    } finally {
      visiting.delete(key)
    }
  }

  for (const root of roots) await visit(root)
  return [...resolved.values()].sort((left, right) => {
    const leftKey = `${left.step.id}@${left.step.version}#${left.step.definitionHash}`
    const rightKey = `${right.step.id}@${right.step.version}#${right.step.definitionHash}`
    return leftKey.localeCompare(rightKey)
  })
}
