import {
  assertNativeQualificationLossGateway,
  bindNativeQualificationAnalysisSource,
  selectNativeQualificationAnalysis,
  acceptNativeQualificationAnalysis,
  type NativeQualificationLossControl,
} from '@/lib/quality-journey/codex-app-server/native-qualification-loss'
import { randomBytes } from 'node:crypto'
import { createSubmissionPayloadCapture } from './quality-journey-submission-payload-observation'
import type { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { analysisCharterSchema, hashAnalysisCharter, qualityJourneyContractVersion } from '@/lib/quality-journey'
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
export async function createManagedQualityJourneyRoleDelivery(options: {
  binding: ExternalQualityJourneySubmissionBinding
  canonicalDefinitions: readonly CanonicalMcpDefinition[]
  client: PrismaClient
  qualificationLoss?: NativeQualificationLossControl
  nativeEnvelopeDigest?: string
  /** Optional original caller adapter, e.g. the separately composed in-memory package bridge. */
  exchange?: (
    toolName: string,
    args: Readonly<Record<string, unknown>>,
    canonical: () => Promise<unknown>,
  ) => Promise<unknown>
}) {
  const binding = structuredClone(options.binding)
  const { client } = options
  const loss = options.qualificationLoss
  const selectionSource = Object.freeze({})
  if (loss) bindNativeQualificationAnalysisSource(loss, selectionSource)
  let selectedAnalysis: { charterHash: string; revisionId: string } | undefined
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
    { argumentsDigest: string; capture: ReturnType<typeof createSubmissionPayloadCapture> }
  >()
  const originalResults = new Map<string, unknown>()
  const accepted = new Map<
    string,
    {
      argumentsDigest: string
      capture: ReturnType<typeof createSubmissionPayloadCapture>
    }
  >()

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
            const parsed = loss
              ? captureOfflineProviderJson(analysisArguments.parse(call.arguments))
              : analysisArguments.parse(call.arguments)
            const parsedCharter = analysisCharterSchema.parse({
              ...parsed.charter,
              schemaVersion: qualityJourneyContractVersion,
              journeyId: binding.journeyId,
              targetProjectId: binding.targetProjectId,
            })
            const charter = loss ? captureOfflineProviderJson(parsedCharter) : parsedCharter
            if (loss) {
              const charterHash = hashAnalysisCharter(charter)
              selectNativeQualificationAnalysis(loss, selectionSource, {
                rawWorkerArgumentsDigest: offlineCompositionDigest(call.arguments),
                normalizedArgumentsDigest: offlineCompositionDigest(parsed),
                charterHash,
                charterRevisionId: charter.analysisRevisionId,
                workerInputDigest: authority.item.inputHash,
                nativeEnvelopeDigest: options.nativeEnvelopeDigest!,
                idempotencyKey: parsed.idempotencyKey,
              })
              selectedAnalysis = Object.freeze({ charterHash, revisionId: charter.analysisRevisionId })
            }
            const result = await submitExternalQualityJourneyAnalysisSuccessor(
              {
                ...parsed,
                charter,
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
  async function readWitness(idempotencyKey: string, capture: ReturnType<typeof createSubmissionPayloadCapture>) {
    const expectedPayloadHash = capture.payloadHash()
    if (!expectedPayloadHash) throw new Error('Original canonical submission payload was not observed')
    await assertManagedWorkerSubmissionOutcome({ ...binding, operation: entry.operation, idempotencyKey }, client)
    const result = await readExternalQualityJourneySubmissionOutcome(
      { ...binding, operation: entry.operation, idempotencyKey, expectedPayloadHash },
      client,
    )
    if (capture.payloadHash() !== expectedPayloadHash)
      throw new Error('Original canonical submission payload observation is uncertain')
    return Object.freeze({
      accepted: true,
      operation: entry.operation,
      idempotencyKey,
      acceptanceDigest: offlineCompositionDigest(result.outcome),
    })
  }
  function hasOriginal(key: string, argumentsDigest: string): boolean {
    const original = originalCalls.get(key)
    if (!original) return false
    if (original.argumentsDigest !== argumentsDigest) throw new Error('Changed offline replay payload')
    return true
  }
  async function rememberOriginal(key: string, argumentsDigest: string) {
    if (hasOriginal(key, argumentsDigest)) return
    // Retain the authenticated pre-I/O lookup boundary. Its presence/absence
    // is not correlation evidence; only the subsequently observed payload hash is.
    try {
      await readExternalQualityJourneySubmissionOutcome(
        { ...binding, operation: entry.operation, idempotencyKey: key },
        client,
      )
    } catch (error) {
      if ((error as { code?: string }).code !== 'NOT_FOUND') throw error
    }
    if (hasOriginal(key, argumentsDigest)) return
    const capture = createSubmissionPayloadCapture({ ...binding, operation: entry.operation, idempotencyKey: key })
    originalCalls.set(key, { argumentsDigest, capture })
  }
  function verifyAnalysisAcceptanceScope(analysis: {
    journeyId: string
    targetProjectId: string
    submittedWorkItemId: string
    submittedAttemptId: string
  }) {
    if (
      analysis.journeyId !== binding.journeyId ||
      analysis.targetProjectId !== binding.targetProjectId ||
      analysis.submittedWorkItemId !== binding.workItemId ||
      analysis.submittedAttemptId !== binding.attemptId
    )
      throw new Error('Original Analysis acceptance lineage refused')
  }
  function acceptSelectedAnalysis(originalResult: unknown, capture: ReturnType<typeof createSubmissionPayloadCapture>) {
    if (!loss) return
    const analysis = z
      .object({
        analysisRevision: z
          .object({
            id: z.string(),
            journeyId: z.string(),
            targetProjectId: z.string(),
            contentHash: z.string(),
            submittedWorkItemId: z.string(),
            submittedAttemptId: z.string(),
          })
          .passthrough(),
      })
      .passthrough()
      .parse(originalResult).analysisRevision
    verifyAnalysisAcceptanceScope(analysis)
    if (
      !selectedAnalysis ||
      analysis.id !== selectedAnalysis.revisionId ||
      analysis.contentHash !== selectedAnalysis.charterHash ||
      !capture.payloadHash()
    )
      throw new Error('Original Analysis acceptance lineage refused')
    acceptNativeQualificationAnalysis(loss, selectionSource, {
      id: analysis.id,
      contentHash: analysis.contentHash,
      resultDigest: offlineCompositionDigest(originalResult),
      requestPayloadDigest: capture.payloadHash()!,
    })
  }
  function originalCanonical(
    call: OfflineProviderCall,
    args: Record<string, unknown>,
    key: string,
    argumentsDigest: string,
  ) {
    let entered = false,
      returned = false
    let originalResult: unknown
    let originalReceipt: OfflineRoleDeliveryReceipt | undefined
    return {
      returned: () => returned,
      result: () => structuredClone(originalResult),
      receipt: () => originalReceipt,
      async invoke() {
        assertAdmission()
        if (entered) throw new Error('Duplicate offline canonical call')
        entered = true
        const original = originalCalls.get(key)
        const value = original
          ? await original.capture.run(() => invokeCanonical(call.toolName, args))
          : await invokeCanonical(call.toolName, args)
        originalResult = structuredClone(value.result)
        if (call.toolName === entry.submit) {
          originalResults.set(key, structuredClone(originalResult))
          if (!original) throw new Error('Original canonical submission capture is missing')
          originalReceipt = await readWitness(key, original.capture)
          accepted.set(key, { argumentsDigest, capture: original.capture })
          acceptSelectedAnalysis(originalResult, original.capture)
        } else await current()
        returned = true
        return value
      },
    }
  }
  async function deliveryReceipt(toolName: string, key: string): Promise<OfflineRoleDeliveryReceipt> {
    if (toolName === entry.submit) {
      const original = originalCalls.get(key)
      if (!original) throw new Error('Original canonical submission capture is missing')
      return readWitness(key, original.capture)
    }
    return Object.freeze({ accepted: false, operation: toolName, idempotencyKey: key, acceptanceDigest: null })
  }
  function assertAdmission() {
    if (admissionClosed) throw new Error('Offline role delivery is fenced')
    assertNativeQualificationLossGateway(loss)
  }
  type FulfilledDelivery = {
    operation: Promise<{ result: unknown; receipt: OfflineRoleDeliveryReceipt }>
    argumentsDigest: string
    result: unknown
    receipt: OfflineRoleDeliveryReceipt
  }
  const fulfilledDeliveries = new Map<string, FulfilledDelivery>()
  async function invokeOriginal(
    call: OfflineProviderCall,
    pin: (key: string, argumentsDigest: string) => void,
  ): Promise<{ result: unknown; receipt: OfflineRoleDeliveryReceipt }> {
    assertNativeQualificationLossGateway(loss)
    const args = capture(call)
    const key = typeof args.idempotencyKey === 'string' ? args.idempotencyKey : ''
    const argumentsDigest = offlineCompositionDigest({ toolName: call.toolName, arguments: args })
    pin(key, argumentsDigest)
    const previous = accepted.get(key)
    if (previous) {
      if (previous.argumentsDigest !== argumentsDigest) throw new Error('Changed offline replay payload')
      return { result: structuredClone(originalResults.get(key)), receipt: await readWitness(key, previous.capture) }
    }
    assertAdmission()
    await current()
    assertAdmission()
    if (call.toolName === entry.submit) await rememberOriginal(key, argumentsDigest)
    assertAdmission()
    const canonical = originalCanonical(call, args, key, argumentsDigest)
    if (exchange) await exchange(call.toolName, args, canonical.invoke)
    else await canonical.invoke()
    if (!canonical.returned()) throw new Error('Offline exchange omitted canonical delivery')
    return {
      result: canonical.result(),
      receipt: loss && canonical.receipt() ? canonical.receipt()! : await deliveryReceipt(call.toolName, key),
    }
  }
  function observeOriginalDelivery(call: OfflineProviderCall) {
    let captured: { key: string; argumentsDigest: string } | undefined
    const operation = invokeOriginal(call, (key, argumentsDigest) => {
      captured = { key, argumentsDigest }
    })
    void operation.then(
      value => {
        if (
          !captured ||
          call.toolName !== entry.submit ||
          !value.receipt.accepted ||
          fulfilledDeliveries.has(captured.key)
        )
          return
        fulfilledDeliveries.set(captured.key, {
          operation,
          argumentsDigest: captured.argumentsDigest,
          result: structuredClone(value.result),
          receipt: structuredClone(value.receipt),
        })
      },
      () => {},
    )
    return operation
  }
  async function readAccepted(call: OfflineProviderCall) {
    if (loss) throw new Error('Loss-controlled delivery requires canonical recovery read')
    const args = capture(call),
      key = typeof args.idempotencyKey === 'string' ? args.idempotencyKey : ''
    const original = fulfilledDeliveries.get(key),
      captured = accepted.get(key)
    const argumentsDigest = offlineCompositionDigest({ toolName: call.toolName, arguments: args })
    if (!original || !captured || call.toolName !== entry.submit || original.argumentsDigest !== argumentsDigest)
      return null
    await original.operation
    const receipt = await readWitness(key, captured.capture)
    if (receipt.acceptanceDigest !== original.receipt.acceptanceDigest) return null
    return Object.freeze({ result: structuredClone(original.result), receipt, argumentsDigest })
  }
  return Object.freeze({
    profile,
    sealedGrant: gateway.sealedGrant,
    profileDigest: profile.contractDigest,
    fence() {
      admissionClosed = true
    },
    invoke: observeOriginalDelivery,
    readAccepted,
    /** Only the exact original issued call can recover a correlated durable witness. */
    async readCommitted(call: OfflineProviderCall): Promise<OfflineRoleDeliveryReceipt | null> {
      if (loss) throw new Error('Loss-controlled delivery requires canonical recovery read')
      const args = capture(call)
      const key = typeof args.idempotencyKey === 'string' ? args.idempotencyKey : ''
      const previous = accepted.get(key)
      const original = originalCalls.get(key)
      const expected = offlineCompositionDigest({ toolName: call.toolName, arguments: args })
      const captured = previous?.argumentsDigest === expected ? previous : original
      if (!captured || captured.argumentsDigest !== expected || !captured.capture.payloadHash()) return null
      try {
        return await readWitness(key, captured.capture)
      } catch {
        return null
      }
    },
  })
}
