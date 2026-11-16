import {
  bindNativeQualificationLossControl,
  bindNativeQualificationLossRuntime,
  assertNativeQualificationLossGateway,
  inspectNativeQualificationLoss,
  nativeQualificationLossKind,
  retainNativeQualificationLossOperation,
  waitNativeQualificationLossPhysicalRelease,
  type NativeQualificationLossControl,
} from '@/lib/quality-journey/codex-app-server/native-qualification-loss'
import {
  createOriginalNativeOutcomeCandidate,
  type OriginalNativeOutcomeCandidate,
  type NativeOutcomeReviewControl,
} from '@/lib/quality-journey/codex-app-server/native-outcome-source'
import {
  inspectNativeOutcomeProfile,
  type NativeOutcomeProfile,
} from '@/lib/quality-journey/codex-app-server/native-outcome-profile'
import type { ProviderSourceDatabase } from '@/lib/quality-journey/provider-source-database'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import type { PrismaClient } from '@prisma/client'
import { z } from 'zod'
import { canonicalContractJson } from '@/lib/catalog-contracts'
import type {
  CanonicalMcpDefinition,
  ManagedWorkerRegistrationProfile,
} from '@/lib/quality-journey/managed-worker-gateway'
import {
  requireNativeDiagnostic,
  type NativeDiagnosticObserver,
  type NativeDiagnosticStage,
} from '@/lib/quality-journey/codex-app-server/native-qualification-diagnostics'
import {
  launchNativeQualificationChild,
  originalNativeQualificationLossOwner,
} from '@/lib/quality-journey/codex-app-server/native-qualification-child'
import {
  verifyNativeQualificationPlan,
  nativeQualificationDigest,
  type CapturedNativeQualificationPlan,
} from '@/lib/quality-journey/codex-app-server/native-qualification-contract'
import {
  inspectNativeQualificationConfiguration,
  type NativeConfigurationInspection,
} from '@/lib/quality-journey/codex-app-server/native-qualification-configuration'
import { createManagedQualityJourneyRoleDelivery } from './quality-journey-managed-role-delivery'
import { readInternalWorkerAuthority } from './quality-journey-internal-worker-authority'
import {
  createQualityJourneyProcessSupervisor,
  trustedJourneyProcessAdapter,
} from './quality-journey-process-supervisor'
import type { PrepareQualityJourneyProviderRunInput } from './quality-journey-provider-run-service'

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)
const emptyThreadSchema = z
  .object({
    model: z.literal('gpt-6.1-sol'),
    reasoningEffort: z.literal('medium'),
    approvalPolicy: z.literal('never'),
    modelProvider: z.literal('openai'),
    sandbox: z.object({ type: z.literal('readOnly'), networkAccess: z.literal(false).optional() }).passthrough(),
    cwd: z.string(),
    thread: z
      .object({
        id: z.string().min(1),
        modelProvider: z.literal('openai'),
        cwd: z.string(),
        ephemeral: z.literal(true),
        turns: z.array(z.unknown()).length(0),
        preview: z.literal(''),
      })
      .passthrough(),
  })
  .passthrough()
function verifyEmptyNativeThread(value: unknown, cwd: string) {
  const parsed = emptyThreadSchema.safeParse(value)
  return parsed.success && parsed.data.cwd === cwd && parsed.data.thread.cwd === cwd
}
const mcpSchema = z
  .object({
    data: z
      .array(
        z
          .object({
            name: z.literal('appraise_worker'),
            runtimeStatus: z.literal('connected'),
            toolsError: z.null(),
            httpOrigin: z.string().nullable().optional(),
            pluginId: z.null().optional(),
            resources: z.array(z.unknown()).length(0),
            resourceTemplates: z.array(z.unknown()).length(0),
            serverInfo: z.object({ name: z.string(), version: z.literal('0.0.0-p0-proof') }).passthrough(),
            serverCapabilities: z.object({ tools: z.object({}).strict() }).strict(),
            tools: z.record(z.unknown()),
          })
          .passthrough(),
      )
      .length(1),
    nextCursor: z.null().optional(),
  })
  .passthrough()
function verifyManagedMcp(
  value: unknown,
  profile: Awaited<ReturnType<typeof createManagedQualityJourneyRoleDelivery>>['profile'],
  port: number,
) {
  const parsed = mcpSchema.safeParse(value)
  if (!parsed.success) return false
  const server = parsed.data.data[0],
    tools = Object.values(server.tools)
  return (
    (server.httpOrigin == null || server.httpOrigin === `http://127.0.0.1:${port}`) &&
    server.serverInfo.name === `appraise-quality-journey-worker-${profile.role.toLowerCase()}` &&
    tools.length === profile.tools.length &&
    profile.tools.every(tool =>
      tools.some(
        observed =>
          record(observed) && observed.name === tool.name && isDeepStrictEqual(observed.inputSchema, tool.inputSchema),
      ),
    )
  )
}

type NativeEndpointOptions = Readonly<{
  host: '127.0.0.1'
  port: number
  path: string
  capability: string
  capabilityCommitment: string
  profile: ManagedWorkerRegistrationProfile
  expectedProfileDigest: string
  sealedGrant: string
  bodyBytes: number
  httpRequests: number
  toolCalls: number
  requestMs: number
  cleanupMs: number
  callGateway: (call: {
    sealedGrant: string
    profileDigest: string
    toolName: string
    arguments: Record<string, unknown>
  }) => Promise<{ result: unknown; receipt: unknown }>
}>
type NativeEndpoint = Readonly<{
  fence: () => void
  snapshot: () => Readonly<{
    fenced: boolean
    requests: number
    calls: number
    inFlight: number
    effectUnknown: boolean
  }>
  close: () => Promise<Readonly<{ closed: boolean; effectUnknown: boolean }>>
}>
type NativeEndpointFactory = (options: NativeEndpointOptions) => Promise<NativeEndpoint>

/** Offline implemented native composition. Unregistered; a manifest supplies no effect authority. */
export async function createNativeQualityJourneyQualification(
  options: {
    plan: CapturedNativeQualificationPlan
    /** Captured trusted parent transport; never sourced from worker input. */
    createEndpoint: NativeEndpointFactory
    input: PrepareQualityJourneyProviderRunInput
    envelope: readonly Record<string, unknown>[]
    canonicalDefinitions: readonly CanonicalMcpDefinition[]
    diagnostics?: NativeDiagnosticObserver
    qualificationLoss?: Readonly<{ control: NativeQualificationLossControl; fixture: object }>
    nativeOutcome?: Readonly<{
      profile: NativeOutcomeProfile
      database: ProviderSourceDatabase
      reviewControl: NativeOutcomeReviewControl
    }>
  },
  client: PrismaClient,
) {
  const { plan, createEndpoint, diagnostics } = options
  if (typeof createEndpoint !== 'function') throw new Error('Trusted native endpoint factory required')
  const captured = verifyNativeQualificationPlan(plan),
    { manifest } = captured
  const input = structuredClone(options.input),
    envelope = structuredClone(options.envelope)
  for (const [key, value] of Object.entries(manifest.binding)) {
    if (input[key as keyof typeof input] !== value) throw new Error('Native canonical binding mismatch')
  }
  const databases = await client.$queryRawUnsafe<Array<{ name: string; file: string }>>('PRAGMA database_list')
  if (databases.find(item => item.name === 'main')?.file !== manifest.database.path)
    throw new Error('Native database binding mismatch')
  await client.$transaction(tx => readInternalWorkerAuthority(input, tx))
  if (JSON.stringify(envelope).includes(input.assignmentSecret))
    throw new Error('Native envelope contains private authority')
  const envelopeDigest = nativeQualificationDigest(
    canonicalContractJson({ input: envelope, model: 'gpt-6.1-sol', effort: 'medium' }),
  )
  if (
    envelopeDigest !== manifest.envelopeDigest ||
    input.configurationDigest !== `sha256:${manifest.configurationSha256}`
  )
    throw new Error('Native frozen envelope/configuration mismatch')
  const nativeOutcomeOptions = options.nativeOutcome
    ? Object.freeze({
        ...options.nativeOutcome,
        reviewControl: Object.freeze({ ...options.nativeOutcome.reviewControl }),
      })
    : undefined
  if (nativeOutcomeOptions && inspectNativeOutcomeProfile(nativeOutcomeOptions.profile).plan !== plan)
    throw new Error('Exact C1 original plan required')
  const loss = options.qualificationLoss?.control
  function bindOriginalLossControl() {
    if (!loss) return
    if (!nativeOutcomeOptions) throw new Error('Loss control requires the exact original source profile')
    if (
      nativeQualificationLossKind(loss) === 'R3_ACCEPTED_ANALYSIS_REPLY_LOSS' &&
      input.role !== 'REQUIREMENT_ANALYZER'
    )
      throw new Error('Accepted Analysis loss requires Analyzer work')
    bindNativeQualificationLossControl(loss, {
      fixture: options.qualificationLoss!.fixture,
      client,
      plan,
      profile: nativeOutcomeOptions.profile,
      scope: {
        journeyId: input.journeyId,
        targetProjectId: input.targetProjectId,
        workItemId: input.workItemId,
        attemptId: input.attemptId,
      },
    })
  }
  bindOriginalLossControl()
  function hasControlledLocalClosureProof() {
    if (!loss) return false
    const proof = inspectNativeQualificationLoss(loss).proof
    return proof.VALIDATED && proof.WITHHELD && proof.PAUSE_COMMITTED && !proof.UNPROVEN
  }
  const delivery = await createManagedQualityJourneyRoleDelivery({
    binding: input,
    canonicalDefinitions: options.canonicalDefinitions,
    client,
    qualificationLoss: loss,
    nativeEnvelopeDigest: manifest.envelopeDigest,
  })
  if (
    delivery.profileDigest !== manifest.roleProfileDigest ||
    !isDeepStrictEqual(delivery.profile.tools.map(tool => tool.name).sort(), [...manifest.enabledTools].sort())
  )
    throw new Error('Native role profile mismatch')
  let nativeOutcome: OriginalNativeOutcomeCandidate | undefined
  const cwd = path.join(manifest.freshRoot, 'cwd')
  let endpoint: NativeEndpoint | undefined
  let configurationInspection: NativeConfigurationInspection | null = null
  let disconnectOriginal: (() => boolean) | undefined
  function validate(stage: NativeDiagnosticStage, check: () => boolean) {
    requireNativeDiagnostic(diagnostics, stage)
    try {
      const valid = check()
      requireNativeDiagnostic(diagnostics, stage, valid ? 'ACCEPTED' : 'REFUSED', valid ? 'NONE' : 'VALIDATION_REFUSED')
      return valid
    } catch (error) {
      diagnostics?.record(stage, 'REFUSED', 'VALIDATION_REFUSED')
      throw error
    }
  }
  const supervisor = createQualityJourneyProcessSupervisor(
    input,
    {
      capability: trustedJourneyProcessAdapter,
      configurationDigest: input.configurationDigest,
      input: envelope,
      turnAcknowledgementTimeoutMs: manifest.limits.acknowledgementMs,
      fenceDelivery() {
        try {
          delivery.fence()
        } finally {
          endpoint?.fence()
        }
      },
      nativeOutcome: nativeOutcomeOptions
        ? {
            async armed(permit, transportId) {
              requireNativeDiagnostic(diagnostics, 'SOURCE_ARMED')
              try {
                nativeOutcome = await createOriginalNativeOutcomeCandidate({
                  ...nativeOutcomeOptions,
                  qualificationLoss: loss,
                  permit,
                  transportId,
                  providerNamespace: input.providerNamespace,
                  diagnostics,
                })
                requireNativeDiagnostic(diagnostics, 'SOURCE_ARMED', 'SETTLED')
              } catch (error) {
                diagnostics?.record('SOURCE_ARMED', 'REFUSED', 'BOUNDARY_REFUSED')
                throw error
              }
            },
            operation(operation) {
              if (!nativeOutcome) throw new Error('Original native outcome not admitted')
              nativeOutcome.supervisorOperation(operation)
            },
            stop(operation) {
              if (loss) retainNativeQualificationLossOperation(loss, operation)
              nativeOutcome?.captureSupervisorStop(operation)
            },
          }
        : undefined,
      validateReadiness: value =>
        validate(
          'INITIALIZE_VALIDATE',
          () => record(value) && value.codexHome === path.join(manifest.freshRoot, 'codex-home'),
        ),
      nativeReadiness: {
        cwd,
        validateConfiguration: value =>
          validate('CONFIG_VALIDATE', () => {
            configurationInspection = Object.freeze(
              inspectNativeQualificationConfiguration(value, manifest, captured.capability),
            )
            return configurationInspection.valid
          }),
        validateThread: value => validate('THREAD_VALIDATE', () => verifyEmptyNativeThread(value, cwd)),
        validateRequiredMcp: value =>
          validate('MCP_VALIDATE', () => verifyManagedMcp(value, delivery.profile, manifest.endpoint.port)),
        mcpStatusParams: { serverName: manifest.endpoint.serverName, detail: 'full', limit: 1 },
      },
      async launch(callbacks) {
        try {
          verifyNativeQualificationPlan(plan)
        } catch (error) {
          diagnostics?.record('PLAN_VERIFY', 'REFUSED', 'BOUNDARY_REFUSED')
          throw error
        }
        requireNativeDiagnostic(diagnostics, 'ENDPOINT_CREATE')
        try {
          endpoint = await createEndpoint({
            ...manifest.endpoint,
            capability: captured.capability,
            profile: delivery.profile,
            expectedProfileDigest: delivery.profileDigest,
            sealedGrant: delivery.sealedGrant,
            ...manifest.limits,
            async callGateway(call) {
              assertNativeQualificationLossGateway(loss)
              const state = supervisor.snapshot()
              if (
                state.fenced ||
                !state.turnStartEntered ||
                call.sealedGrant !== delivery.sealedGrant ||
                call.profileDigest !== delivery.profileDigest
              )
                throw new Error('Native managed delivery admission refused')
              const operation = delivery.invoke({
                callId: randomUUID(),
                toolName: call.toolName,
                arguments: call.arguments,
              })
              nativeOutcome?.gateway(operation)
              return operation
            },
          })
        } catch (error) {
          diagnostics?.record('ENDPOINT_CREATE', 'REFUSED', 'BOUNDARY_REFUSED')
          throw error
        }
        const originalEndpoint = endpoint
        let originalChild: Awaited<ReturnType<typeof launchNativeQualificationChild>> | undefined
        try {
          requireNativeDiagnostic(diagnostics, 'ENDPOINT_CREATE', 'SETTLED')
          if (supervisor.snapshot().fenced) throw new Error('Native launch fenced')
          originalChild = await launchNativeQualificationChild(plan, {
            ...callbacks,
            diagnostics,
            qualificationLoss: loss,
            assertAdmission() {
              if (supervisor.snapshot().fenced) throw new Error('Native launch fenced')
            },
            captureOriginalDisconnect(disconnect) {
              disconnectOriginal = disconnect
            },
            fenceMcp: originalEndpoint.fence,
            closeMcp: async () => {
              if (loss) await waitNativeQualificationLossPhysicalRelease(loss)
              const originalClose = originalEndpoint.close()
              if (loss) retainNativeQualificationLossOperation(loss, originalClose)
              nativeOutcome?.captureSdkClose(originalClose)
              const receipt = await originalClose
              const controlledLocalClosure = hasControlledLocalClosureProof()
              // Caller/provider effect uncertainty remains recorded; this return concerns local physical closure only.
              return receipt.closed && (!receipt.effectUnknown || !!controlledLocalClosure)
            },
          })
          nativeOutcome?.attach(originalChild)
          if (loss)
            bindNativeQualificationLossRuntime(loss, {
              child: originalChild,
              owner: originalNativeQualificationLossOwner(originalChild, plan),
              endpoint: originalEndpoint,
              logicalFence() {
                delivery.fence()
                originalEndpoint.fence()
                originalChild!.transport.fence('qualification_loss')
                void supervisor.cancel().catch(() => {})
              },
            })
          return originalChild
        } catch (error) {
          originalEndpoint.fence()
          if (originalChild) await originalChild.stop()
          else {
            if (loss) await waitNativeQualificationLossPhysicalRelease(loss)
            await originalEndpoint.close()
          }
          throw error
        }
      },
    },
    client,
  )
  diagnostics?.onFailure(() => {
    try {
      delivery.fence()
    } finally {
      try {
        endpoint?.fence()
      } finally {
        nativeOutcome?.revoke()
        void supervisor.cancel().catch(() => {})
      }
    }
  })
  return Object.freeze({
    start: supervisor.start,
    originalNativeOutcome: () => (loss ? undefined : nativeOutcome),
    disconnectOriginalSupervisor: () => disconnectOriginal?.() ?? false,
    cancel: supervisor.cancel,
    waitOriginalStop: supervisor.waitOriginalStop,
    readAcceptedManagedDelivery: (call: { toolName: string; arguments: Record<string, unknown> }) =>
      delivery.readAccepted({ ...call, callId: 'native-original-accepted-read' }),
    snapshot: () =>
      Object.freeze({
        ...(loss ? { qualificationLoss: inspectNativeQualificationLoss(loss) } : {}),
        ...supervisor.snapshot(),
        ...(diagnostics?.failed() ? { diagnosticStatus: 'DIAGNOSTIC_UNAVAILABLE' as const } : {}),
        provenance: 'NATIVE_QUALIFICATION_OBSERVATION' as const,
        runtimeQualified: false as const,
        providerTerminationProven: false as const,
        slotReleased: false as const,
        hostIsolation: 'NOT_ATTESTED' as const,
        configurationInspection,
        helperLifetime: 'UNKNOWN_NOT_INDEPENDENTLY_OBSERVED' as const,
        mcp: endpoint?.snapshot(),
      }),
  })
}
