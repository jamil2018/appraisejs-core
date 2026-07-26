import prisma from '@/config/db-config'
import type { Prisma } from '@prisma/client'
import {
  computeStepReferenceHash,
  stepDefinitionSchema,
  stepInvocationSchema,
  type StepDefinition,
  type StepInvocation,
} from '../../../packages/cucumber-runtime/src/step-definitions/contracts.ts'

export type InvocationInput = { invocation: unknown }
type StepDefinitionReader = Pick<Prisma.TransactionClient, 'stepDefinition'>

function exactDefinitionForInvocation(invocation: StepInvocation, definitions: StepDefinition[]) {
  return definitions.find(
    definition =>
      definition.identity.id === invocation.step.id &&
      definition.identity.version === invocation.step.version &&
      computeStepReferenceHash(definition) === invocation.step.definitionHash,
  )
}

export async function resolveReadyExactStepDefinitions(
  steps: InvocationInput[],
  client: StepDefinitionReader = prisma,
): Promise<StepDefinition[] | null> {
  const invocations = steps.map(step => stepInvocationSchema.parse(step.invocation))
  const references = invocations.map(invocation => invocation.step)
  const definitions = await client.stepDefinition.findMany({
    where: { OR: references.map(reference => ({ id: reference.id, version: reference.version, status: 'ready' })) },
    select: { definitionJson: true },
  })
  const parsedDefinitions = definitions.map(definition =>
    stepDefinitionSchema.parse(JSON.parse(definition.definitionJson)),
  )
  const exactDefinitions = invocations.map(invocation => exactDefinitionForInvocation(invocation, parsedDefinitions))

  return exactDefinitions.every(Boolean) ? (exactDefinitions as StepDefinition[]) : null
}
