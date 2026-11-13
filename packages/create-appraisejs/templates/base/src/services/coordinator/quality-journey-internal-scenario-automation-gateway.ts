import { createHash } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { z } from 'zod'

import { canonicalContractJson } from '@/lib/catalog-contracts'
import {
  automationScenarioMaterializationSchema,
  hashScenarioPortfolio,
  qualityJourneyContractVersion,
  scenarioPortfolioSchema,
  type WorkerResultEnvelope,
} from '@/lib/quality-journey'
import {
  createManagedWorkerRegistrationProfile,
  executeManagedWorkerGatewayCall,
  createManagedWorkerAssignmentGrant,
  type CanonicalMcpDefinition,
} from '@/lib/quality-journey/managed-worker-gateway'
import { readInternalWorkerAuthority } from './quality-journey-internal-worker-authority'
import { ServiceError } from '@/services/shared/errors'
import {
  materializeInternalQualityJourneyApprovedScenarios,
  readInternalAutomatorAssignment,
} from './quality-journey-automation-service'
import {
  internalScenarioPortfolioRevisionId,
  readInternalScenarioDesignerAssignment,
  submitExternalQualityJourneyScenarioPortfolio,
} from './quality-journey-scenario-service'
import {
  assertManagedWorkerSubmissionOutcome,
  type ExternalQualityJourneySubmissionBinding,
} from './quality-journey-service'

const hash = (value: unknown) => `sha256:${createHash('sha256').update(canonicalContractJson(value)).digest('hex')}`
const roles = {
  TEST_SCENARIO_DESIGNER: {
    read: 'quality_journey_scenarios_get',
    submit: 'quality_journey_scenarios_submit',
    operation: 'SCENARIO_PORTFOLIO_SUBMIT',
  },
  AUTOMATOR: {
    read: 'quality_journey_automation_context_get',
    submit: 'quality_journey_automation_materialize',
    operation: 'AUTOMATION_MATERIALIZE',
  },
} as const
const idempotencyKey = z.string().min(1).max(200)

/** Trusted in-process composition for disposable managed Journeys. */
export async function createQualityJourneyInternalScenarioAutomationGateway(
  input: ExternalQualityJourneySubmissionBinding,
  canonicalDefinitions: readonly CanonicalMcpDefinition[],
  client: PrismaClient,
) {
  const binding = structuredClone(input)
  const { role, journeyId, targetProjectId, workItemId, attemptId, leaseId } = binding
  if (role !== 'TEST_SCENARIO_DESIGNER' && role !== 'AUTOMATOR')
    throw new ServiceError('Internal gateway requires a Scenario Designer or Automator assignment.', 'UNAUTHORIZED')
  const tools = roles[role]
  const profile = createManagedWorkerRegistrationProfile(role, canonicalDefinitions)
  const read = () =>
    client.$transaction(async tx => {
      const { journey, item, ...authority } = await readInternalWorkerAuthority(binding, tx)
      const assignment =
        role === 'TEST_SCENARIO_DESIGNER'
          ? {
              role,
              ...(await readInternalScenarioDesignerAssignment(journey, item, tx)),
              portfolioRevisionId: internalScenarioPortfolioRevisionId(journeyId, attemptId),
              inputHash: item.inputHash,
              scopeHash: hash(JSON.parse(item.authorizationScopeJson)),
            }
          : { role, ...(await readInternalAutomatorAssignment(journey, item, tx)) }
      return {
        assignment,
        ...authority,
      }
    })
  const original = await read()
  const originalDigest = hash(original.assignment)
  const { secret, sealedGrant } = createManagedWorkerAssignmentGrant(binding, profile, original)

  return {
    profile,
    sealedGrant,
    async callGateway(inputCall: {
      sealedGrant: string
      profileDigest: string
      toolName: string
      arguments: Record<string, unknown>
    }) {
      const call = structuredClone(inputCall)
      if (
        call.profileDigest !== profile.contractDigest ||
        (call.toolName !== tools.read && call.toolName !== tools.submit)
      )
        throw new ServiceError('Tool is outside the internal worker profile.', 'UNAUTHORIZED')
      let acceptedKey: string | undefined
      return executeManagedWorkerGatewayCall({
        ...call,
        secret,
        profile,
        async authorize({ stage, requestHash }) {
          if (stage === 'after_io' && acceptedKey) {
            await assertManagedWorkerSubmissionOutcome(
              { ...binding, operation: tools.operation, idempotencyKey: acceptedKey },
              client,
            )
          } else {
            const current = await read()
            if (
              current.authorizationId !== original.authorizationId ||
              current.roleContractDigest !== original.roleContractDigest ||
              hash(current.assignment) !== originalDigest
            )
              throw new ServiceError('Internal worker grant has stale assignment inputs.', 'CONFLICT')
          }
          return { decisionDigest: hash({ stage, requestHash, attemptId }), ownerToken: binding.assignmentSecret }
        },
        async invoke({ principal }) {
          const assignment = original.assignment
          if (call.toolName === tools.read) {
            z.strictObject({}).parse(call.arguments)
            return structuredClone(assignment)
          }
          const result: WorkerResultEnvelope = {
            schemaVersion: qualityJourneyContractVersion,
            assignmentId: binding.assignmentId,
            workItemId,
            attemptId,
            role,
            roleContractDigest: original.roleContractDigest,
            inputHash: principal.inputHash,
            status: 'COMPLETED',
            outputs: [],
            evidenceReceipts: [],
            assumptions: [],
            blockers: [],
            unresolvedQuestions: [],
            submittedAt: new Date().toISOString(),
          }
          const envelope = {
            journeyId,
            targetProjectId,
            workItemId,
            attemptId,
            leaseId,
            assignmentId: binding.assignmentId,
            assignmentGeneration: binding.assignmentGeneration,
            assignmentSecret: binding.assignmentSecret,
            expectedInputHash: principal.inputHash,
            expectedScopeHash: principal.scopeHash,
          }
          if (assignment.role === 'TEST_SCENARIO_DESIGNER') {
            const request = z
              .strictObject({ idempotencyKey, portfolio: z.record(z.string(), z.unknown()) })
              .parse(call.arguments)
            const portfolio = scenarioPortfolioSchema.parse({ ...request.portfolio, journeyId, targetProjectId })
            if (
              portfolio.cycleId !== assignment.cycleId ||
              portfolio.portfolioId !== assignment.portfolioId ||
              portfolio.portfolioRevisionId !== assignment.portfolioRevisionId ||
              portfolio.discoveryRevisionId !== assignment.discoveryRevisionId ||
              portfolio.discoveryCompletionHash !== assignment.discoveryCompletionHash ||
              portfolio.predecessorPortfolioRevisionId !== assignment.revisionContext?.portfolio.portfolioRevisionId
            )
              throw new ServiceError(
                'Scenario proposal must bind the Appraise-issued portfolio and Discovery lineage.',
                'CONFLICT',
              )
            result.outputs = [
              {
                kind: 'SCENARIO_PORTFOLIO_REVISION',
                artifactId: portfolio.portfolioId,
                revisionId: portfolio.portfolioRevisionId,
                contentHash: hashScenarioPortfolio(portfolio),
              },
              ...portfolio.scenarios.map(scenario => ({
                kind: 'SCENARIO_REVISION' as const,
                artifactId: scenario.stableScenarioId,
                revisionId: scenario.scenarioRevisionId,
                contentHash: hash(scenario),
              })),
            ]
            const accepted = await submitExternalQualityJourneyScenarioPortfolio(
              { ...envelope, idempotencyKey: request.idempotencyKey, portfolio, result },
              binding.principal,
              client,
              binding,
            )
            acceptedKey = request.idempotencyKey
            return {
              portfolioRevisionId: accepted.portfolio.artifactRevisionId,
              status: accepted.portfolio.status,
              replayed: accepted.replayed,
            }
          }
          const request = z
            .strictObject({
              idempotencyKey,
              scenarios: z.array(automationScenarioMaterializationSchema).min(1).max(512),
            })
            .parse(call.arguments)
          const accepted = await materializeInternalQualityJourneyApprovedScenarios(
            { ...envelope, ...request, result },
            binding.principal,
            client,
            binding,
          )
          acceptedKey = request.idempotencyKey
          return {
            replayed: accepted.replayed,
            materializations: accepted.materializations.map(row => ({
              scenarioRevisionId: row.scenarioRevisionId,
              suiteId: row.suiteId,
              testCaseId: row.testCaseId,
              preparedCapsuleId: row.preparedCapsule?.id,
              status: row.status,
            })),
          }
        },
      })
    },
  }
}
