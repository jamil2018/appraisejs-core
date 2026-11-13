import { randomBytes } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { analysisCharterSchema, qualityJourneyContractVersion } from '@/lib/quality-journey'
import {
  createManagedWorkerRegistrationProfile,
  executeManagedWorkerGatewayCall,
  sealManagedWorkerRuntimeGrant,
  type CanonicalMcpDefinition,
} from '@/lib/quality-journey/managed-worker-gateway'
import {
  offlineCompositionDigest,
  captureOfflineProviderJson,
  type OfflineProviderCall,
  type OfflineRoleDeliveryReceipt,
} from '@/lib/quality-journey/codex-app-server/provider-composition-contract'
import { readInternalWorkerAuthority } from './quality-journey-internal-worker-authority'
import { createQualityJourneyInternalDiscoveryGateway } from './quality-journey-internal-discovery-gateway'
import { createQualityJourneyInternalScenarioAutomationGateway } from './quality-journey-internal-scenario-automation-gateway'
import { createQualityJourneyInternalTriageGateway } from './quality-journey-internal-triage-gateway'
import {
  getQualityJourneyAnalysis,
  submitExternalQualityJourneyAnalysisSuccessor,
} from './quality-journey-analysis-service'
import {
  assertManagedWorkerSubmissionOutcome,
  readExternalQualityJourneySubmissionOutcome,
  type ExternalQualityJourneySubmissionBinding,
} from './quality-journey-service'

const roleOperations = Object.freeze({
  REQUIREMENT_ANALYZER: {
    read: ['quality_journey_analysis_get'],
    submit: 'quality_journey_analysis_submit',
    operation: 'ANALYSIS_SUBMIT',
  },
  SCOUT: {
    read: ['quality_journey_discovery_get'],
    submit: 'quality_journey_target_observation_submit',
    operation: 'TARGET_OBSERVATION_SUBMIT',
  },
  RESOURCE_EXPLORER: {
    read: ['quality_journey_discovery_get'],
    submit: 'quality_journey_resource_resolution_submit',
    operation: 'RESOURCE_RESOLUTION_SUBMIT',
  },
  TEST_SCENARIO_DESIGNER: {
    read: ['quality_journey_scenarios_get'],
    submit: 'quality_journey_scenarios_submit',
    operation: 'SCENARIO_PORTFOLIO_SUBMIT',
  },
  AUTOMATOR: {
    read: ['quality_journey_automation_context_get'],
    submit: 'quality_journey_automation_materialize',
    operation: 'AUTOMATION_MATERIALIZE',
  },
  TRIAGER: {
    read: ['quality_journey_triage_get', 'quality_journey_triage_evidence_read'],
    submit: 'quality_journey_triage_submit',
    operation: 'TRIAGE_REPORT_SUBMIT',
  },
})
const forbidden = new Set([
  'assignmentSecret',
  'ownerToken',
  'principal',
  'projectBearer',
  'sealedGrant',
  'assignmentId',
  'assignmentGeneration',
  'leaseId',
  'attemptId',
  'workItemId',
  'journeyId',
  'targetProjectId',
  'coordinatorSessionId',
  'coordinatorGeneration',
  'coordinatorPrincipalId',
])
const analysisArguments = z
  .object({
    idempotencyKey: z.string().min(1).max(200),
    charter: analysisCharterSchema.innerType().omit({ schemaVersion: true, journeyId: true, targetProjectId: true }),
    predecessorAnalysisRevisionId: z.string().min(1).max(200).optional(),
  })
  .strict()

/** Closed role projection. Canonical services alone own mutations and durable acceptance. */
export async function createOfflineQualityJourneyRoleDelivery(options: {
  binding: ExternalQualityJourneySubmissionBinding
  canonicalDefinitions: readonly CanonicalMcpDefinition[]
  client: PrismaClient
  /** Optional original caller adapter, e.g. the separately composed in-memory package bridge. */
  exchange?: (
    toolName: string,
    args: Readonly<Record<string, unknown>>,
    canonical: () => Promise<unknown>,
  ) => Promise<unknown>
}) {
  const binding = structuredClone(options.binding)
  const { client } = options
  const canonicalDefinitions = captureOfflineProviderJson(options.canonicalDefinitions)
  const exchange = options.exchange
  const entry = roleOperations[binding.role]
  if (!entry) throw new Error('Unsupported offline role')
  await client.$transaction(tx => readInternalWorkerAuthority(binding, tx))
  const profile = createManagedWorkerRegistrationProfile(binding.role, canonicalDefinitions)
  const gateway = await createGateway()
  let admissionClosed = false
  const originalCalls = new Map<
    string,
    { argumentsDigest: string; outcomeAbsent: boolean; canonicalEntered: boolean }
  >()
  const accepted = new Map<string, { argumentsDigest: string; receipt: OfflineRoleDeliveryReceipt }>()

  async function createGateway() {
    if (binding.role === 'SCOUT' || binding.role === 'RESOURCE_EXPLORER')
      return createQualityJourneyInternalDiscoveryGateway(binding, canonicalDefinitions, client)
    if (binding.role === 'TEST_SCENARIO_DESIGNER' || binding.role === 'AUTOMATOR')
      return createQualityJourneyInternalScenarioAutomationGateway(binding, canonicalDefinitions, client)
    if (binding.role === 'TRIAGER')
      return createQualityJourneyInternalTriageGateway(binding, canonicalDefinitions, client)
    return createAnalysisGateway()
  }
  async function createAnalysisGateway() {
    const authority = await client.$transaction(tx => readInternalWorkerAuthority(binding, tx))
    const frozen = offlineCompositionDigest({
      inputHash: authority.item.inputHash,
      scope: authority.item.authorizationScopeJson,
      authorizationId: authority.authorizationId,
    })
    const secret = randomBytes(32)
    const sealedGrant = sealManagedWorkerRuntimeGrant(
      {
        target: binding.targetProjectId,
        targetProjectId: binding.targetProjectId,
        journeyId: binding.journeyId,
        workItemId: binding.workItemId,
        role: binding.role,
        attemptId: binding.attemptId,
        generation: binding.assignmentGeneration,
        leaseId: binding.leaseId,
        authorizationId: authority.authorizationId,
        inputHash: authority.item.inputHash,
        scopeHash: offlineCompositionDigest(JSON.parse(authority.item.authorizationScopeJson)),
        profileDigest: profile.contractDigest,
        expiresAt: authority.expiresAt,
      },
      secret,
    )
    return {
      profile,
      sealedGrant,
      async callGateway(call: {
        sealedGrant: string
        profileDigest: string
        toolName: string
        arguments: Record<string, unknown>
      }) {
        if (call.toolName === entry.submit) analysisArguments.parse(call.arguments)
        else z.object({}).strict().parse(call.arguments)
        let acceptedKey: string | undefined
        return executeManagedWorkerGatewayCall({
          ...call,
          secret,
          profile,
          async authorize({ stage, requestHash }) {
            if (stage === 'after_io' && acceptedKey)
              await assertManagedWorkerSubmissionOutcome(
                { ...binding, operation: entry.operation, idempotencyKey: acceptedKey },
                client,
              )
            else {
              const current = await client.$transaction(tx => readInternalWorkerAuthority(binding, tx))
              if (
                offlineCompositionDigest({
                  inputHash: current.item.inputHash,
                  scope: current.item.authorizationScopeJson,
                  authorizationId: current.authorizationId,
                }) !== frozen
              )
                throw new Error('Changed offline Analysis scope')
            }
            return {
              decisionDigest: offlineCompositionDigest({ stage, requestHash }),
              ownerToken: binding.assignmentSecret,
            }
          },
          async invoke({ toolName }) {
            if (toolName !== entry.submit)
              return getQualityJourneyAnalysis(
                { journeyId: binding.journeyId, targetProjectId: binding.targetProjectId },
                client,
              )
            const parsed = analysisArguments.parse(call.arguments)
            const result = await submitExternalQualityJourneyAnalysisSuccessor(
              {
                ...parsed,
                charter: analysisCharterSchema.parse({
                  ...parsed.charter,
                  schemaVersion: qualityJourneyContractVersion,
                  journeyId: binding.journeyId,
                  targetProjectId: binding.targetProjectId,
                }),
                journeyId: binding.journeyId,
                targetProjectId: binding.targetProjectId,
                workItemId: binding.workItemId,
                attemptId: binding.attemptId,
                assignmentId: binding.assignmentId,
                assignmentGeneration: binding.assignmentGeneration,
                leaseId: binding.leaseId,
                assignmentSecret: binding.assignmentSecret,
              },
              binding.principal,
              client,
              binding,
            )
            acceptedKey = parsed.idempotencyKey
            return result
          },
        })
      },
    }
  }
  async function invokeCanonical(toolName: string, args: Record<string, unknown>) {
    return gateway.callGateway({
      sealedGrant: gateway.sealedGrant,
      profileDigest: gateway.profile.contractDigest,
      toolName,
      arguments: args,
    })
  }
  function capture(call: OfflineProviderCall) {
    const args = captureOfflineProviderJson(call.arguments)
    if (!profile.tools.some(tool => tool.name === call.toolName) || Object.keys(args).some(key => forbidden.has(key)))
      throw new Error('Offline role call exceeds captured scope')
    if (Buffer.byteLength(JSON.stringify(args)) > 1_048_576) throw new Error('Offline role call exceeds bound')
    return args
  }
  async function current() {
    await client.$transaction(tx => readInternalWorkerAuthority(binding, tx))
  }
  async function readWitness(idempotencyKey: string) {
    await assertManagedWorkerSubmissionOutcome({ ...binding, operation: entry.operation, idempotencyKey }, client)
    const result = await readExternalQualityJourneySubmissionOutcome(
      { ...binding, operation: entry.operation, idempotencyKey },
      client,
    )
    return Object.freeze({
      accepted: true,
      operation: entry.operation,
      idempotencyKey,
      acceptanceDigest: offlineCompositionDigest(result.outcome),
    })
  }
  async function rememberOriginal(key: string, argumentsDigest: string) {
    let outcomeAbsent = false
    try {
      await readExternalQualityJourneySubmissionOutcome(
        { ...binding, operation: entry.operation, idempotencyKey: key },
        client,
      )
    } catch (error) {
      if ((error as { code?: string }).code !== 'NOT_FOUND') throw error
      outcomeAbsent = true
    }
    const original = originalCalls.get(key)
    if (original && original.argumentsDigest !== argumentsDigest) throw new Error('Changed offline replay payload')
    originalCalls.set(key, { argumentsDigest, outcomeAbsent, canonicalEntered: false })
  }
  function originalCanonical(
    call: OfflineProviderCall,
    args: Record<string, unknown>,
    key: string,
    argumentsDigest: string,
  ) {
    let entered = false
    return {
      entered: () => entered,
      async invoke() {
        assertAdmission()
        if (entered) throw new Error('Duplicate offline canonical call')
        entered = true
        const original = originalCalls.get(key)
        if (original) original.canonicalEntered = true
        const value = await invokeCanonical(call.toolName, args)
        if (call.toolName === entry.submit) {
          const receipt = await readWitness(key)
          accepted.set(key, { argumentsDigest, receipt })
        } else await current()
        return value
      },
    }
  }
  async function deliveryReceipt(toolName: string, key: string): Promise<OfflineRoleDeliveryReceipt> {
    if (toolName === entry.submit) return accepted.get(key)?.receipt ?? (await readWitness(key))
    return Object.freeze({ accepted: false, operation: toolName, idempotencyKey: key, acceptanceDigest: null })
  }
  function assertAdmission() {
    if (admissionClosed) throw new Error('Offline role delivery is fenced')
  }
  return Object.freeze({
    profile,
    profileDigest: profile.contractDigest,
    fence() {
      admissionClosed = true
    },
    async invoke(call: OfflineProviderCall): Promise<OfflineRoleDeliveryReceipt> {
      const args = capture(call)
      const key = typeof args.idempotencyKey === 'string' ? args.idempotencyKey : ''
      const argumentsDigest = offlineCompositionDigest({ toolName: call.toolName, arguments: args })
      const previous = accepted.get(key)
      if (previous) {
        if (previous.argumentsDigest !== argumentsDigest) throw new Error('Changed offline replay payload')
        return readWitness(key)
      }
      assertAdmission()
      await current()
      assertAdmission()
      if (call.toolName === entry.submit) await rememberOriginal(key, argumentsDigest)
      assertAdmission()
      const canonical = originalCanonical(call, args, key, argumentsDigest)
      if (exchange) await exchange(call.toolName, args, canonical.invoke)
      else await canonical.invoke()
      if (!canonical.entered()) throw new Error('Offline exchange omitted canonical delivery')
      return deliveryReceipt(call.toolName, key)
    },
    /** Only the exact original issued call can recover a correlated durable witness. */
    async readCommitted(call: OfflineProviderCall): Promise<OfflineRoleDeliveryReceipt | null> {
      const args = capture(call)
      const key = typeof args.idempotencyKey === 'string' ? args.idempotencyKey : ''
      const previous = accepted.get(key)
      const original = originalCalls.get(key)
      const expected = offlineCompositionDigest({ toolName: call.toolName, arguments: args })
      if (previous?.argumentsDigest === expected) return readWitness(key)
      if (!original?.outcomeAbsent || !original.canonicalEntered || original.argumentsDigest !== expected) return null
      try {
        return await readWitness(key)
      } catch {
        return null
      }
    },
  })
}
