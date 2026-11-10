import { createHash, randomBytes } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import { qualityJourneyContractVersion } from '@/lib/quality-journey'
import {
  createManagedWorkerRegistrationProfile,
  executeManagedWorkerGatewayCall,
  sealManagedWorkerRuntimeGrant,
  type CanonicalMcpDefinition,
} from '@/lib/quality-journey/managed-worker-gateway'
import { ServiceError } from '@/services/shared/errors'
import { assertCoordinatorAttemptSession } from './quality-journey-coordinator-session'
import {
  readInternalDiscoveryAssignment,
  submitExternalQualityJourneyResourceResolution,
  submitExternalQualityJourneyTargetObservation,
} from './quality-journey-discovery-service'
import {
  readCurrentExternalWorkAuthority,
  readExternalQualityJourneySubmissionOutcome,
  type ExternalQualityJourneySubmissionBinding,
} from './quality-journey-service'

const digest = (value: unknown) => `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`
const discoveryRead = 'quality_journey_discovery_get'
const submissionArguments = z.object({
  discoveryRevisionId: z.string(),
  idempotencyKey: z.string().min(1).max(200),
  bundle: z.record(z.string(), z.unknown()),
})

/** Trusted in-process composition for disposable managed Journeys. */
export async function createQualityJourneyInternalDiscoveryGateway(
  input: ExternalQualityJourneySubmissionBinding,
  canonicalDefinitions: readonly CanonicalMcpDefinition[],
  client: PrismaClient,
) {
  const binding = structuredClone(input)
  const role = binding.role
  if (role !== 'SCOUT' && role !== 'RESOURCE_EXPLORER')
    throw new ServiceError('Internal Discovery gateway requires a Discovery role.', 'UNAUTHORIZED')
  const profile = createManagedWorkerRegistrationProfile(role, canonicalDefinitions)
  const submitTool =
    role === 'SCOUT' ? 'quality_journey_target_observation_submit' : 'quality_journey_resource_resolution_submit'
  const operation = role === 'SCOUT' ? 'TARGET_OBSERVATION_SUBMIT' : 'RESOURCE_RESOLUTION_SUBMIT'
  const submit =
    role === 'SCOUT' ? submitExternalQualityJourneyTargetObservation : submitExternalQualityJourneyResourceResolution

  const read = () =>
    client.$transaction(async tx => {
      const { item, attempt } = await readCurrentExternalWorkAuthority(binding, tx)
      const journey = await tx.qualityJourney.findUniqueOrThrow({ where: { id: binding.journeyId } })
      if (!attempt.authorizationId || !attempt.externalAdmissionId || item.currentAttempt !== attempt.attempt)
        throw new ServiceError('Internal Discovery admission is stale.', 'UNAUTHORIZED')
      const assignment = await readInternalDiscoveryAssignment(journey, { ...item, role }, tx)
      return {
        assignment,
        authorizationId: attempt.authorizationId,
        inputHash: item.inputHash,
        scopeHash: digest(JSON.parse(item.authorizationScopeJson)),
        expiresAt: attempt.leaseExpiresAt.toISOString(),
      }
    })
  const original = await read()
  const secret = randomBytes(32)
  const sealedGrant = sealManagedWorkerRuntimeGrant(
    {
      target: binding.targetProjectId,
      targetProjectId: binding.targetProjectId,
      journeyId: binding.journeyId,
      workItemId: binding.workItemId,
      role,
      attemptId: binding.attemptId,
      generation: binding.assignmentGeneration,
      leaseId: binding.leaseId,
      authorizationId: original.authorizationId,
      inputHash: original.inputHash,
      scopeHash: original.scopeHash,
      profileDigest: profile.contractDigest,
      expiresAt: original.expiresAt,
    },
    secret,
  )

  async function readCurrent() {
    const current = await read()
    if (
      current.authorizationId !== original.authorizationId ||
      current.inputHash !== original.inputHash ||
      current.scopeHash !== original.scopeHash ||
      current.assignment.discoveryRevisionId !== original.assignment.discoveryRevisionId
    )
      throw new ServiceError('Internal Discovery grant has stale assignment scope.', 'CONFLICT')
    return current.assignment
  }

  return {
    profile,
    sealedGrant,
    async callGateway(call: {
      sealedGrant: string
      profileDigest: string
      toolName: string
      arguments: Record<string, unknown>
    }) {
      if (
        call.profileDigest !== profile.contractDigest ||
        (call.toolName !== discoveryRead && call.toolName !== submitTool)
      )
        throw new ServiceError('Tool is outside the internal Discovery profile.', 'UNAUTHORIZED')
      let assignment: Awaited<ReturnType<typeof readCurrent>>
      let acceptedKey: string | undefined
      return executeManagedWorkerGatewayCall({
        ...call,
        secret,
        profile,
        async authorize({ stage, requestHash }) {
          if (stage === 'after_io' && acceptedKey) {
            await assertCoordinatorAttemptSession(binding, client)
            await readExternalQualityJourneySubmissionOutcome(
              { ...binding, operation, idempotencyKey: acceptedKey },
              client,
            )
          } else {
            assignment = await readCurrent()
          }
          return {
            decisionDigest: digest({ stage, requestHash, attemptId: binding.attemptId }),
            ownerToken: binding.assignmentSecret,
          }
        },
        async invoke({ principal, toolName, arguments: args }) {
          if (toolName === discoveryRead) return assignment
          const request = submissionArguments.parse(args)
          if (request.discoveryRevisionId !== assignment.discoveryRevisionId)
            throw new ServiceError('Submission must name the active Discovery revision.', 'CONFLICT')
          const result = await submit(
            {
              journeyId: binding.journeyId,
              targetProjectId: binding.targetProjectId,
              workItemId: binding.workItemId,
              attemptId: binding.attemptId,
              leaseId: binding.leaseId,
              assignmentId: binding.assignmentId,
              assignmentGeneration: binding.assignmentGeneration,
              assignmentSecret: binding.assignmentSecret,
              discoveryRevisionId: request.discoveryRevisionId,
              idempotencyKey: request.idempotencyKey,
              expectedInputHash: principal.inputHash,
              expectedScopeHash: principal.scopeHash,
              bundle: {
                ...request.bundle,
                schemaVersion: qualityJourneyContractVersion,
                journeyId: binding.journeyId,
                targetProjectId: binding.targetProjectId,
                workItemId: binding.workItemId,
                attemptId: binding.attemptId,
              },
            },
            binding.principal,
            client,
            binding,
          )
          acceptedKey = request.idempotencyKey
          return {
            discoveryRevisionId: result.discoveryRevision.id,
            status: result.discoveryRevision.status,
            replayed: result.replayed,
          }
        },
      })
    },
  }
}
