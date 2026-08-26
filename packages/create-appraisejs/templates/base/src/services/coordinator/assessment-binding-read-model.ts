import prisma from '@/config/db-config'
import { ServiceError } from '@/services/shared/errors'
import {
  computeStepReferenceHash,
  stepDefinitionSchema,
  validateStepInvocationInputs,
} from '../../../packages/cucumber-runtime/src/step-definitions/contracts.ts'

type StepBinding = { stepId: string; version: string; inputs: Record<string, unknown> }
type LocatorBinding = { locatorIds: string[] }

function assertNoDuplicateBindingValues(
  values: string[],
  onDuplicate: (firstIndex: number, duplicateIndex: number) => never,
) {
  const indices = new Map<string, number>()
  for (const [index, value] of values.entries()) {
    const firstIndex = indices.get(value)
    if (firstIndex !== undefined) onDuplicate(firstIndex, index)
    indices.set(value, index)
  }
}

export async function readReadyStepDefinitions(
  validationBindings: Array<{ steps: StepBinding[] }>,
  client: typeof prisma = prisma,
) {
  const requestedSteps = validationBindings.flatMap(binding => binding.steps)
  const definitions = await client.stepDefinition.findMany({
    where: { OR: requestedSteps.map(step => ({ id: step.stepId, version: step.version, status: 'ready' })) },
    select: { id: true, version: true, definitionJson: true },
  })
  return new Map(
    definitions.map(row => {
      const definition = stepDefinitionSchema.parse(JSON.parse(row.definitionJson))
      return [`${row.id}@${row.version}`, definition] as const
    }),
  )
}

export async function readTargetBoundLocators(
  validationBindings: LocatorBinding[],
  targetProjectId: string,
  onDuplicate: (firstIndex: number, duplicateIndex: number) => never,
  client: typeof prisma = prisma,
) {
  for (const binding of validationBindings) assertNoDuplicateBindingValues(binding.locatorIds, onDuplicate)
  const ids = [...new Set(validationBindings.flatMap(binding => binding.locatorIds))]
  const locators = ids.length
    ? await client.locator.findMany({
        where: {
          id: { in: ids },
          targetProjectId,
          locatorGroup: { targetProjectId, module: { targetProjectId } },
        },
        // A scope binds the locator's authored content, not the persistence
        // timestamps. Runtime projection upserts may legitimately advance a
        // LocatorGroup's `updatedAt`; selecting the whole row here made that
        // server-owned lifecycle write appear as external locator drift.
        select: {
          id: true,
          targetProjectId: true,
          name: true,
          value: true,
          locatorGroupId: true,
          locatorGroup: {
            select: {
              id: true,
              name: true,
              route: true,
              moduleId: true,
              targetProjectId: true,
              module: { select: { targetProjectId: true } },
            },
          },
        },
      })
    : []
  if (
    locators.length !== ids.length ||
    locators.some(
      locator =>
        locator.targetProjectId !== targetProjectId ||
        !locator.locatorGroupId ||
        !locator.locatorGroup ||
        locator.locatorGroup.targetProjectId !== targetProjectId ||
        locator.locatorGroup.module.targetProjectId !== targetProjectId,
    )
  )
    throw new ServiceError(
      'Locator binding must reference a locator and locator group owned by the requested target.',
      'CONFLICT',
      409,
      { code: 'foreign_locator_group' },
    )
  return new Map(locators.map(locator => [locator.id, locator]))
}

export function validatedStepReference(
  step: StepBinding,
  definitions: Awaited<ReturnType<typeof readReadyStepDefinitions>>,
) {
  const definition = definitions.get(`${step.stepId}@${step.version}`)
  if (!definition) throw new ServiceError(`Step Definition ${step.stepId}@${step.version} is not ready.`, 'CONFLICT')
  try {
    validateStepInvocationInputs(definition, step.inputs)
  } catch (error) {
    throw new ServiceError(error instanceof Error ? error.message : 'Step invocation inputs are invalid.', 'VALIDATION')
  }
  return { definition, definitionHash: computeStepReferenceHash(definition) }
}
